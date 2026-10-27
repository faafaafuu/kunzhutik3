"""Point-in-zone checks and address search.

Zones are a handful of polygons per city, so the check is plain Python — no PostGIS.
Address search goes through Yandex Geocoder when a key is set, otherwise through Photon
(OpenStreetMap). Tests and offline development use the stub.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

USER_AGENT = "bright-delivery/1.0"


def point_in_polygon(lat: float, lon: float, ring: list[list[float]]) -> bool:
    """Ray casting over a GeoJSON ring of [lng, lat] pairs."""
    inside = False
    count = len(ring)
    if count < 3:
        return False
    j = count - 1
    for i in range(count):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat):
            cross_x = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < cross_x:
                inside = not inside
        j = i
    return inside


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def circle_polygon(lat: float, lon: float, radius_km: float, points: int = 32) -> list[list[float]]:
    """A closed ring approximating a circle — the starting shape of a new zone."""
    ring = []
    for step in range(points):
        angle = 2 * math.pi * step / points
        d_lat = radius_km / 111.32 * math.cos(angle)
        d_lon = radius_km / (111.32 * math.cos(math.radians(lat))) * math.sin(angle)
        ring.append([round(lon + d_lon, 6), round(lat + d_lat, 6)])
    ring.append(ring[0])
    return ring


def validate_ring(ring: list) -> list[list[float]]:
    if not isinstance(ring, list) or len(ring) < 3:
        raise ValueError("Зона должна иметь хотя бы три точки")
    cleaned = []
    for point in ring:
        lon, lat = float(point[0]), float(point[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Координаты вне допустимого диапазона")
        cleaned.append([round(lon, 6), round(lat, 6)])
    if cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    return cleaned


@dataclass
class GeoResult:
    title: str
    subtitle: str
    latitude: float
    longitude: float
    # True when the result points at a building, not just a street or a town.
    precise: bool

    def as_dict(self) -> dict:
        return {
            "title": self.title,
            "subtitle": self.subtitle,
            "text": f"{self.subtitle}, {self.title}" if self.subtitle else self.title,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "precise": self.precise,
        }


class Geocoder:
    def suggest(self, query: str, near: tuple[float, float] | None) -> list[GeoResult]:
        raise NotImplementedError

    def reverse(self, lat: float, lon: float) -> GeoResult | None:
        raise NotImplementedError


class PhotonGeocoder(Geocoder):
    URL = "https://photon.komoot.io"

    def suggest(self, query: str, near: tuple[float, float] | None) -> list[GeoResult]:
        params: dict = {"q": query, "limit": 8}
        if near:
            params.update({"lat": near[0], "lon": near[1], "location_bias_scale": 0.5})
        payload = _get_json(f"{self.URL}/api/", params)
        results = [self._parse(feature) for feature in payload.get("features", [])]
        results = [item for item in results if item]
        if near:
            # Photon also returns namesakes from other regions; delivery is local.
            results = [item for item in results if distance_km(near[0], near[1], item.latitude, item.longitude) < 60]
        return _dedupe(results)[:5]

    def reverse(self, lat: float, lon: float) -> GeoResult | None:
        payload = _get_json(f"{self.URL}/reverse", {"lat": lat, "lon": lon, "limit": 1})
        features = payload.get("features", [])
        return self._parse(features[0]) if features else None

    @staticmethod
    def _parse(feature: dict) -> GeoResult | None:
        props = feature.get("properties", {})
        lon, lat = feature.get("geometry", {}).get("coordinates", [None, None])
        if lat is None:
            return None
        street = props.get("street") or (props.get("name") if props.get("type") == "street" else None)
        house = props.get("housenumber")
        city = props.get("city") or props.get("town") or props.get("village") or props.get("county") or ""
        if street:
            title = f"{street}, {house}" if house else street
        else:
            title = props.get("name") or city
        if not title:
            return None
        subtitle = city if city and city != title else (props.get("state") or "")
        return GeoResult(title=title, subtitle=subtitle, latitude=float(lat), longitude=float(lon), precise=bool(house))


class YandexGeocoder(Geocoder):
    URL = "https://geocode-maps.yandex.ru/1.x/"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def suggest(self, query: str, near: tuple[float, float] | None) -> list[GeoResult]:
        params = {"apikey": self.api_key, "geocode": query, "format": "json", "lang": "ru_RU", "results": 5}
        if near:
            params.update({"ll": f"{near[1]},{near[0]}", "spn": "0.6,0.4"})
        return self._parse(_get_json(self.URL, params))

    def reverse(self, lat: float, lon: float) -> GeoResult | None:
        params = {"apikey": self.api_key, "geocode": f"{lon},{lat}", "format": "json", "lang": "ru_RU", "kind": "house", "results": 1}
        results = self._parse(_get_json(self.URL, params))
        return results[0] if results else None

    @staticmethod
    def _parse(payload: dict) -> list[GeoResult]:
        members = payload.get("response", {}).get("GeoObjectCollection", {}).get("featureMember", [])
        results = []
        for member in members:
            obj = member.get("GeoObject", {})
            lon, lat = (float(value) for value in obj.get("Point", {}).get("pos", "0 0").split())
            meta = obj.get("metaDataProperty", {}).get("GeocoderMetaData", {})
            results.append(
                GeoResult(
                    title=obj.get("name", ""),
                    subtitle=obj.get("description", ""),
                    latitude=lat,
                    longitude=lon,
                    precise=meta.get("kind") == "house",
                )
            )
        return results


class StubGeocoder(Geocoder):
    """Deterministic answers for tests and offline work: a few addresses around the seeded venue."""

    PLACES = [
        GeoResult("улица Дзержинского, 18", "Солнечногорск", 56.188580, 36.982054, True),
        GeoResult("улица Красная, 1", "Солнечногорск", 56.184600, 36.979500, True),
        GeoResult("улица Ленина, 5", "Солнечногорск", 56.181200, 36.973900, True),
        GeoResult("Зеленоград, корпус 1801", "Москва", 55.991000, 37.214000, True),
    ]

    def suggest(self, query: str, near: tuple[float, float] | None) -> list[GeoResult]:
        needle = query.lower()
        return [place for place in self.PLACES if any(word in place.title.lower() for word in needle.split())][:5]

    def reverse(self, lat: float, lon: float) -> GeoResult | None:
        return min(self.PLACES, key=lambda place: distance_km(lat, lon, place.latitude, place.longitude))


_cache: dict[tuple, tuple[float, object]] = {}
CACHE_SECONDS = 600


def get_geocoder() -> Geocoder:
    choice = settings.geocoder
    if choice == "stub":
        return StubGeocoder()
    if choice == "yandex" or (choice == "auto" and settings.yandex_geocoder_api_key):
        return YandexGeocoder(settings.yandex_geocoder_api_key or "")
    return PhotonGeocoder()


def suggest(query: str, near: tuple[float, float] | None) -> list[dict]:
    key = ("suggest", query.strip().lower(), near and (round(near[0], 2), round(near[1], 2)))
    return _cached(key, lambda: [item.as_dict() for item in get_geocoder().suggest(query.strip(), near)])


def reverse(lat: float, lon: float) -> dict | None:
    key = ("reverse", round(lat, 5), round(lon, 5))

    def load():
        result = get_geocoder().reverse(lat, lon)
        return result.as_dict() if result else None

    return _cached(key, load)


def _cached(key: tuple, loader):
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = loader()
    if len(_cache) > 2000:
        _cache.clear()
    _cache[key] = (now, value)
    return value


def _get_json(url: str, params: dict) -> dict:
    try:
        response = httpx.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=6)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        logger.exception("Geocoder request failed: %s", url)
        return {}


def _dedupe(results: list[GeoResult]) -> list[GeoResult]:
    seen = set()
    unique = []
    for item in results:
        key = (item.title, item.subtitle)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique
