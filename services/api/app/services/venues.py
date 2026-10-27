"""Venue hours, delivery zones and picking the venue that serves an address."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, selectinload

from app.core.errors import ApiError, money_str
from app.models.venue import DeliveryZone, Venue
from app.services.geo import distance_km, point_in_polygon

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAY_TITLES = {"mon": "пн", "tue": "вт", "wed": "ср", "thu": "чт", "fri": "пт", "sat": "сб", "sun": "вс"}
SLOT_MINUTES = 30
SLOT_DAYS = 2


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def intervals_for(venue: Venue, day: date) -> list[tuple[datetime, datetime]]:
    """Opening intervals of a local date as aware datetimes. Closing after midnight is allowed ("10:00"–"02:00")."""
    tz = ZoneInfo(venue.timezone)
    raw = venue.special_days.get(day.isoformat()) if venue.special_days else None
    if raw is None:
        raw = (venue.working_hours or {}).get(WEEKDAYS[day.weekday()], [])
    result = []
    for start_raw, end_raw in raw:
        start = datetime.combine(day, time.fromisoformat(start_raw), tz)
        end = datetime.combine(day, time.fromisoformat(end_raw), tz)
        if end <= start:
            end += timedelta(days=1)
        result.append((start, end))
    return result


def open_interval_at(venue: Venue, moment: datetime) -> tuple[datetime, datetime] | None:
    local = moment.astimezone(ZoneInfo(venue.timezone))
    # Yesterday's interval may run past midnight.
    for day in (local.date() - timedelta(days=1), local.date()):
        for start, end in intervals_for(venue, day):
            if start <= moment < end:
                return start, end
    return None


def is_open(venue: Venue, moment: datetime | None = None) -> bool:
    return open_interval_at(venue, moment or utcnow()) is not None


def next_opening(venue: Venue, moment: datetime | None = None) -> datetime | None:
    moment = moment or utcnow()
    local_day = moment.astimezone(ZoneInfo(venue.timezone)).date()
    for offset in range(0, 8):
        for start, _ in intervals_for(venue, local_day + timedelta(days=offset)):
            if start > moment:
                return start
    return None


def closes_at(venue: Venue, moment: datetime | None = None) -> datetime | None:
    interval = open_interval_at(venue, moment or utcnow())
    return interval[1] if interval else None


def time_slots(venue: Venue, lead_minutes: int, moment: datetime | None = None) -> list[datetime]:
    """Half-hour slots for an order "ко времени": today and tomorrow, inside opening hours, after lead time."""
    moment = moment or utcnow()
    earliest = moment + timedelta(minutes=lead_minutes)
    local_day = moment.astimezone(ZoneInfo(venue.timezone)).date()
    slots: list[datetime] = []
    for offset in range(SLOT_DAYS):
        for start, end in intervals_for(venue, local_day + timedelta(days=offset)):
            slot = start + timedelta(minutes=lead_minutes)
            # Round up to a whole half hour.
            minute = (slot.minute + SLOT_MINUTES - 1) // SLOT_MINUTES * SLOT_MINUTES
            slot = slot.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=minute)
            while slot <= end:
                if slot >= earliest:
                    slots.append(slot)
                slot += timedelta(minutes=SLOT_MINUTES)
    return slots


def hours_text(venue: Venue) -> str:
    """"ежедневно с 10:00 до 22:00" or "пн–пт 10:00–22:00, сб–вс 11:00–23:00"."""
    groups: list[tuple[list[str], str]] = []
    for day in WEEKDAYS:
        intervals = (venue.working_hours or {}).get(day, [])
        text = ", ".join(f"{start}–{end}" for start, end in intervals) or "выходной"
        if groups and groups[-1][1] == text:
            groups[-1][0].append(day)
        else:
            groups.append(([day], text))
    if len(groups) == 1:
        intervals = (venue.working_hours or {}).get("mon", [])
        if len(intervals) == 1:
            return f"ежедневно с {intervals[0][0]} до {intervals[0][1]}"
        return f"ежедневно {groups[0][1]}"
    parts = []
    for days, text in groups:
        label = WEEKDAY_TITLES[days[0]] if len(days) == 1 else f"{WEEKDAY_TITLES[days[0]]}–{WEEKDAY_TITLES[days[-1]]}"
        parts.append(f"{label} {text}")
    return ", ".join(parts)


def active_venues(db: Session) -> list[Venue]:
    return (
        db.query(Venue)
        .options(selectinload(Venue.zones))
        .filter(Venue.is_active.is_(True))
        .order_by(Venue.created_at)
        .all()
    )


def get_venue(db: Session, venue_id) -> Venue:
    venue = db.query(Venue).options(selectinload(Venue.zones)).filter(Venue.id == venue_id, Venue.is_active.is_(True)).first()
    if not venue:
        raise ApiError("venue_not_found", "Точка не найдена", status=404)
    return venue


@dataclass
class Resolution:
    venue: Venue
    zone: DeliveryZone


def resolve_delivery(db: Session, lat: float, lon: float, *, venue_id=None) -> Resolution:
    """The venue and zone that deliver to a point.

    Among zones that contain the point, an open venue wins over a closed one, then the higher
    zone priority, then the nearer venue. Out of all zones → out_of_delivery_zone.
    """
    candidates: list[tuple[Venue, DeliveryZone]] = []
    for venue in active_venues(db):
        if venue_id and str(venue.id) != str(venue_id):
            continue
        for zone in venue.zones:
            if zone.is_active and point_in_polygon(lat, lon, zone.polygon):
                candidates.append((venue, zone))
    if not candidates:
        raise ApiError("out_of_delivery_zone", "Сюда пока не доставляем", status=422, details={"latitude": lat, "longitude": lon})
    now = utcnow()
    candidates.sort(
        key=lambda pair: (
            0 if is_open(pair[0], now) else 1,
            -pair[1].priority,
            distance_km(lat, lon, float(pair[0].latitude), float(pair[0].longitude)),
        )
    )
    venue, zone = candidates[0]
    return Resolution(venue=venue, zone=zone)


def default_venue(db: Session) -> Venue | None:
    venues = active_venues(db)
    return venues[0] if venues else None


def venue_payload(venue: Venue, moment: datetime | None = None) -> dict:
    moment = moment or utcnow()
    opened = open_interval_at(venue, moment)
    upcoming = None if opened else next_opening(venue, moment)
    return {
        "id": str(venue.id),
        "code": venue.code,
        "title": venue.title,
        "address": venue.address,
        "city": venue.city,
        "phone": venue.phone,
        "latitude": float(venue.latitude),
        "longitude": float(venue.longitude),
        "timezone": venue.timezone,
        "hours_text": hours_text(venue),
        "is_open": opened is not None,
        "closes_at": opened[1].isoformat() if opened else None,
        "opens_at": upcoming.isoformat() if upcoming else None,
        "cook_minutes": venue.cook_minutes,
        "pickup_enabled": venue.pickup_enabled,
    }


def zone_payload(zone: DeliveryZone) -> dict:
    return {
        "id": str(zone.id),
        "venue_id": str(zone.venue_id),
        "title": zone.title,
        "color": zone.color,
        "polygon": zone.polygon,
        "delivery_fee": money_str(zone.delivery_fee),
        "free_delivery_from": money_str(zone.free_delivery_from) if zone.free_delivery_from is not None else None,
        "min_order_amount": money_str(zone.min_order_amount),
        "eta_minutes": zone.eta_minutes,
        "priority": zone.priority,
        "is_active": zone.is_active,
    }
