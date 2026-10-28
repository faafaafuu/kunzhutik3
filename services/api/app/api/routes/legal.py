"""Legal pages: requisites, offer, delivery, refunds, privacy.

Rendered on the server as plain HTML, not by the client app: payment providers and other robots
check these pages without running JavaScript. Requisites come from LEGAL_* in .env, delivery terms
from the venues and zones in the database, so the pages match what the checkout charges.
"""

from html import escape

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.services.venues import active_venues, hours_text
from app.store.catalog import BRAND_NAME

router = APIRouter(include_in_schema=False)

PAGES = [
    ("/legal", "Реквизиты и контакты"),
    ("/legal/offer", "Публичная оферта"),
    ("/legal/delivery", "Доставка и оплата"),
    ("/legal/refund", "Отмена и возврат"),
    ("/legal/privacy", "Персональные данные"),
]

STYLE = """
body { margin: 0; background: var(--surface); color: var(--ink); font: 500 16px/1.6 Manrope, system-ui, sans-serif; }
.wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.top { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; color: var(--ink); text-decoration: none; font-weight: 700; }
.dot { width: 36px; height: 36px; border-radius: 50%; background: var(--brand); color: var(--on-brand); display: grid; place-items: center; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
nav a { padding: 8px 14px; border-radius: 999px; background: var(--surface-card); color: var(--ink); text-decoration: none; font-size: 14px; font-weight: 600; }
nav a.on { background: var(--brand); color: var(--on-brand); }
main { background: var(--surface-card); border-radius: 24px; padding: 24px; box-shadow: var(--shadow-card); }
h1 { margin: 0 0 16px; font-size: 26px; line-height: 1.25; }
h2 { margin: 24px 0 8px; font-size: 18px; }
p, li { margin: 6px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 10px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
td:first-child { color: var(--ink-soft); width: 42%; padding-right: 12px; }
.missing { color: var(--danger); }
.muted { color: var(--ink-soft); font-size: 14px; }
footer { margin-top: 20px; color: var(--ink-soft); font-size: 13px; }
a { color: var(--brand-text); }
"""


def _value(text: str) -> str:
    return escape(text) if text.strip() else '<span class="missing">не указано</span>'


def _seller() -> str:
    """How the seller is named in the texts: «ИП Иванов Иван Иванович, ИНН …»."""
    name = escape(settings.legal_name) if settings.legal_name.strip() else "индивидуальный предприниматель, указанный на странице «Реквизиты и контакты»"
    inn = f", ИНН {escape(settings.legal_inn)}" if settings.legal_inn.strip() else ""
    ogrnip = f", ОГРНИП {escape(settings.legal_ogrnip)}" if settings.legal_ogrnip.strip() else ""
    return f"{name}{inn}{ogrnip}"


def _rub(value) -> str:
    return f"{int(value):,}".replace(",", " ") + " ₽"


def _page(path: str, title: str, body: str) -> HTMLResponse:
    nav = "".join(f'<a href="{href}"{" class=on" if href == path else ""}>{escape(label)}</a>' for href, label in PAGES)
    footer = escape(settings.legal_name) if settings.legal_name.strip() else BRAND_NAME
    if settings.legal_inn.strip():
        footer += f" · ИНН {escape(settings.legal_inn)}"
    if settings.legal_ogrnip.strip():
        footer += f" · ОГРНИП {escape(settings.legal_ogrnip)}"
    html = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" type="image/png" href="/static/favicon.png">
<title>{escape(title)} · {BRAND_NAME}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/static/tokens.css" />
<style>{STYLE}</style>
</head>
<body>
<div class="wrap">
<a class="top" href="/"><span class="dot">Б</span>{BRAND_NAME} — доставка</a>
<nav>{nav}</nav>
<main><h1>{escape(title)}</h1>{body}</main>
<footer>{footer}</footer>
</div>
</body>
</html>"""
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=600"})


@router.get("/legal")
def requisites(db: Session = Depends(get_db)) -> HTMLResponse:
    venues = active_venues(db)
    points = "".join(
        f"<tr><td>{escape(venue.title)}</td><td>{escape(venue.address)}<br><span class=muted>{escape(hours_text(venue))}</span></td></tr>"
        for venue in venues
    )
    body = f"""
<table>
<tr><td>Продавец</td><td>{_value(settings.legal_name)}</td></tr>
<tr><td>ИНН</td><td>{_value(settings.legal_inn)}</td></tr>
<tr><td>ОГРНИП</td><td>{_value(settings.legal_ogrnip)}</td></tr>
<tr><td>Адрес места осуществления деятельности</td><td>{_value(settings.legal_address)}</td></tr>
<tr><td>Телефон</td><td>{_value(settings.support_phone)}</td></tr>
<tr><td>Электронная почта</td><td>{_value(settings.legal_email)}</td></tr>
{points}
</table>
<p class="muted">Цены на сайте указаны в рублях. Заказ можно оплатить наличными или картой при получении, а также картой онлайн, если этот способ предложен при оформлении.</p>
"""
    return _page("/legal", "Реквизиты и контакты", body)


@router.get("/legal/offer")
def offer() -> HTMLResponse:
    seller = _seller()
    body = f"""
<p>Настоящий документ — публичная оферта (ст. 437 Гражданского кодекса РФ) продавца: {seller} (далее — Продавец). Оферта адресована любому дееспособному лицу (далее — Покупатель) и определяет условия продажи блюд и напитков с доставкой и самовывозом через сайт {escape(settings.app_base_url)}, мобильное приложение и Telegram-бота «{BRAND_NAME}».</p>
<h2>1. Акцепт оферты</h2>
<p>Оформляя заказ, Покупатель подтверждает, что ознакомился с офертой и принимает её полностью. Договор считается заключённым с момента оформления заказа.</p>
<h2>2. Предмет договора</h2>
<p>Продавец передаёт Покупателю блюда и напитки по заказу, а Покупатель принимает и оплачивает их. Состав, вес, объём и цена указаны в карточке блюда. Изображения блюд иллюстративные, внешний вид может незначительно отличаться.</p>
<h2>3. Оформление заказа</h2>
<p>Покупатель выбирает блюда, способ получения (доставка или самовывоз), указывает имя, телефон и адрес доставки. Продавец вправе связаться с Покупателем по указанному телефону, чтобы уточнить заказ. Продавец может отказать в заказе, если блюдо закончилось или адрес вне зоны доставки; в этом случае полученная оплата возвращается полностью.</p>
<h2>4. Цена и оплата</h2>
<p>Цены указаны в рублях и включают все налоги. Итоговая сумма с учётом стоимости доставки, скидок и бонусов показывается до оформления заказа. Оплата — наличными или банковской картой при получении, либо банковской картой онлайн через платёжный сервис, если этот способ доступен при оформлении. Кассовый чек выдаётся в соответствии с 54-ФЗ.</p>
<h2>5. Доставка и самовывоз</h2>
<p>Зона, стоимость, минимальная сумма и сроки доставки приведены на странице <a href="/legal/delivery">«Доставка и оплата»</a>. Время доставки ориентировочное и зависит от загрузки кухни и дорожной ситуации.</p>
<h2>6. Отмена и возврат</h2>
<p>Порядок отмены заказа и возврата денег описан на странице <a href="/legal/refund">«Отмена и возврат»</a>.</p>
<h2>7. Бонусная программа</h2>
<p>За оплаченные заказы Покупателю могут начисляться бонусы, которыми можно оплатить часть следующих заказов. Бонусы не обмениваются на деньги. Условия начисления и списания показываются в разделе «Бонусы».</p>
<h2>8. Персональные данные</h2>
<p>Оформляя заказ, Покупатель даёт согласие на обработку своих персональных данных на условиях <a href="/legal/privacy">Политики обработки персональных данных</a>.</p>
<h2>9. Прочие условия</h2>
<p>Споры решаются переговорами, а при недостижении согласия — в порядке, установленном законодательством РФ. Продавец вправе изменять оферту; изменения действуют для заказов, оформленных после их публикации. Реквизиты Продавца — на странице <a href="/legal">«Реквизиты и контакты»</a>.</p>
"""
    return _page("/legal/offer", "Публичная оферта", body)


@router.get("/legal/delivery")
def delivery(db: Session = Depends(get_db)) -> HTMLResponse:
    sections = []
    for venue in active_venues(db):
        zones = [zone for zone in venue.zones if zone.is_active]
        rows = "".join(
            "<tr><td>{title}</td><td>от {min_order} · доставка {fee}{free} · около {eta} мин</td></tr>".format(
                title=escape(zone.title),
                min_order=_rub(zone.min_order_amount),
                fee=_rub(zone.delivery_fee) if zone.delivery_fee else "бесплатно",
                free=f", бесплатно от {_rub(zone.free_delivery_from)}" if zone.free_delivery_from is not None and zone.delivery_fee else "",
                eta=zone.eta_minutes,
            )
            for zone in sorted(zones, key=lambda zone: zone.priority)
        )
        pickup = f"<p>Самовывоз: {escape(venue.address)}, без минимальной суммы.</p>" if venue.pickup_enabled else ""
        sections.append(
            f"<h2>{escape(venue.title)}</h2><p>Часы работы: {escape(hours_text(venue))}.</p>{pickup}"
            + (f"<table>{rows}</table>" if rows else "<p>Доставка из этой точки пока не работает.</p>")
        )
    body = f"""
<p>Заказ доставляет курьер по адресу, указанному при оформлении. Входит ли адрес в зону доставки, сайт проверяет сразу, а стоимость доставки и итоговая сумма показываются до оформления заказа.</p>
{"".join(sections)}
<h2>Оплата</h2>
<p>Наличными или банковской картой курьеру при получении, а также банковской картой онлайн, если этот способ предложен при оформлении. При онлайн-оплате данные карты вводятся на странице платёжного сервиса и Продавцу не передаются.</p>
<h2>Получение заказа</h2>
<p>При получении проверьте комплектность заказа. Если чего-то не хватает или блюдо не соответствует заказу, сообщите курьеру или позвоните по телефону {escape(settings.support_phone)}.</p>
"""
    return _page("/legal/delivery", "Доставка и оплата", body)


@router.get("/legal/refund")
def refund() -> HTMLResponse:
    email = f" или на почту {escape(settings.legal_email)}" if settings.legal_email.strip() else ""
    body = f"""
<h2>Отмена заказа</h2>
<p>Заказ можно отменить бесплатно, пока кухня не начала его готовить: кнопкой «Отменить» на странице заказа или по телефону {escape(settings.support_phone)}. После начала приготовления отмена возможна по согласованию с Продавцом.</p>
<h2>Если с заказом что-то не так</h2>
<p>Если блюда не хватает, оно не соответствует заказу или ненадлежащего качества, сообщите об этом в день получения по телефону {escape(settings.support_phone)}{email}. Продавец заменит блюдо или вернёт его стоимость.</p>
<p>Продукты питания надлежащего качества возврату и обмену не подлежат (постановление Правительства РФ от 31.12.2020 № 2463).</p>
<h2>Возврат денег</h2>
<p>Наличные возвращаются наличными или переводом. Оплата картой возвращается на ту же карту: Продавец оформляет возврат в течение 10 дней с момента обращения (ст. 22 Закона «О защите прав потребителей»), срок зачисления зависит от банка, обычно до 10 рабочих дней. Списанные бонусы возвращаются на бонусный счёт.</p>
"""
    return _page("/legal/refund", "Отмена и возврат", body)


@router.get("/legal/privacy")
def privacy() -> HTMLResponse:
    seller = _seller()
    contact = escape(settings.legal_email) if settings.legal_email.strip() else escape(settings.support_phone)
    body = f"""
<p>Политика составлена в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет, как {seller} (далее — Оператор) обрабатывает персональные данные пользователей сайта, мобильного приложения и Telegram-бота «{BRAND_NAME}».</p>
<h2>1. Какие данные мы обрабатываем</h2>
<ul>
<li>имя и номер телефона;</li>
<li>адрес доставки, подъезд, этаж, квартира, домофон, комментарий к заказу;</li>
<li>состав и история заказов, бонусный баланс;</li>
<li>идентификатор и имя пользователя Telegram — если вход выполнен через Telegram;</li>
<li>технические данные: IP-адрес, тип устройства, токен push-уведомлений.</li>
</ul>
<h2>2. Зачем</h2>
<p>Чтобы принять, приготовить и доставить заказ, связаться по нему, начислять и списывать бонусы, сохранять адреса и историю заказов в личном кабинете, отправлять уведомления о статусе заказа. Рекламные сообщения отправляются только с отдельного согласия, от них можно отказаться в профиле.</p>
<h2>3. Основания</h2>
<p>Обработка необходима для исполнения договора, стороной которого является пользователь (п. 5 ч. 1 ст. 6 152-ФЗ), а также ведётся с согласия пользователя, которое он даёт, оформляя заказ или входя в личный кабинет.</p>
<h2>4. Кому передаём</h2>
<p>Только тем, без кого заказ не выполнить: курьерам — имя, телефон и адрес; сервису отправки SMS — номер телефона для кода входа; платёжному сервису ЮKassa — сумму и данные для кассового чека (телефон и состав заказа); хостинг-провайдеру, на серверах которого работает сервис. Данные банковских карт Оператор не получает и не хранит.</p>
<h2>5. Хранение и защита</h2>
<p>Запись, систематизация, накопление, хранение, уточнение и извлечение персональных данных граждан РФ ведутся с использованием баз данных, находящихся на территории Российской Федерации (ч. 5 ст. 18 152-ФЗ). Данные хранятся, пока у пользователя есть личный кабинет или пока это нужно для целей обработки и требований закона, после чего удаляются. Доступ к данным ограничен, соединение с сайтом защищено шифрованием.</p>
<h2>6. Права пользователя</h2>
<p>Пользователь может узнать, какие его данные обрабатываются, потребовать их уточнения или удаления и отозвать согласие, написав Оператору: {contact}. Ответ — в течение 10 рабочих дней.</p>
"""
    return _page("/legal/privacy", "Политика обработки персональных данных", body)
