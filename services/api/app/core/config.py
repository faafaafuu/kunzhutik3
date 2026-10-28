from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="Брайт", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    app_base_url: str = Field(default="http://localhost:8000", alias="APP_BASE_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    database_url: str = Field(alias="DATABASE_URL")
    # Fill an empty database with the venue, a delivery zone and the menu on first start.
    seed_demo_data: bool = Field(default=True, alias="SEED_DEMO_DATA")
    # Built Expo web app (apps/client → `expo export -p web`). Served at / when present.
    client_dist_dir: str = Field(default="/app/client-dist", alias="CLIENT_DIST_DIR")

    telegram_bot_token: str | None = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_webapp_base_url: str | None = Field(default=None, alias="TELEGRAM_WEBAPP_BASE_URL")
    # @username of the bot for the "Войти через Telegram" link; asked from Telegram (getMe) when empty.
    telegram_bot_username: str | None = Field(default=None, alias="TELEGRAM_BOT_USERNAME")
    # "Войти через Google": a Web client from console.cloud.google.com with the redirect URI
    # <APP_BASE_URL>/auth/google/callback. Both empty — the button says the login is not set up yet.
    google_client_id: str | None = Field(default=None, alias="GOOGLE_CLIENT_ID")
    google_client_secret: str | None = Field(default=None, alias="GOOGLE_CLIENT_SECRET")
    # Staff accounts that receive new-order notifications and may change order status.
    telegram_allowed_user_ids_raw: str = Field(default="", alias="TELEGRAM_ALLOWED_USER_IDS")

    dashboard_secret_key: str = Field(default="change-me-dashboard-secret", alias="DASHBOARD_SECRET_KEY")
    dashboard_cookie_name: str = Field(default="delivery_dashboard_session", alias="DASHBOARD_COOKIE_NAME")
    dashboard_bootstrap_username: str | None = Field(default=None, alias="DASHBOARD_BOOTSTRAP_USERNAME")
    dashboard_bootstrap_password: str | None = Field(default=None, alias="DASHBOARD_BOOTSTRAP_PASSWORD")
    dashboard_bootstrap_role: str = Field(default="admin", alias="DASHBOARD_BOOTSTRAP_ROLE")

    # Customer accounts. Tokens are signed with this key; falls back to the dashboard key.
    customer_jwt_secret: str | None = Field(default=None, alias="CUSTOMER_JWT_SECRET")
    customer_access_ttl_minutes: int = Field(default=60, alias="CUSTOMER_ACCESS_TTL_MINUTES")
    customer_refresh_ttl_days: int = Field(default=60, alias="CUSTOMER_REFRESH_TTL_DAYS")

    # SMS for login codes: "log" writes the code to the api log, "smsru" sends through sms.ru.
    sms_provider: str = Field(default="log", alias="SMS_PROVIDER")
    smsru_api_id: str | None = Field(default=None, alias="SMSRU_API_ID")
    # Return the login code in the API response. Ignored when APP_ENV=production.
    otp_debug: bool = Field(default=False, alias="OTP_DEBUG")

    # Address search. With a key — Yandex Geocoder, without — Photon (OpenStreetMap).
    yandex_geocoder_api_key: str | None = Field(default=None, alias="YANDEX_GEOCODER_API_KEY")
    # auto | yandex | photon | stub
    geocoder: str = Field(default="auto", alias="GEOCODER")

    # Loyalty: bonus percent by 90-day spend ("title:threshold:percent"), and the share of an order bonuses may pay.
    bonus_levels_raw: str = Field(default="Старт:0:3,Свой:5000:5,Друг:15000:7", alias="BONUS_LEVELS")
    bonus_max_redeem_percent: int = Field(default=30, alias="BONUS_MAX_REDEEM_PERCENT")

    support_phone: str = Field(default="+7 (926) 407-01-00", alias="SUPPORT_PHONE")
    # Seller requisites for /legal pages (payment providers check them). Empty — the page says «не указано».
    legal_name: str = Field(default="", alias="LEGAL_NAME")
    legal_inn: str = Field(default="", alias="LEGAL_INN")
    legal_ogrnip: str = Field(default="", alias="LEGAL_OGRNIP")
    legal_address: str = Field(default="", alias="LEGAL_ADDRESS")
    legal_email: str = Field(default="", alias="LEGAL_EMAIL")
    min_supported_app_version: str = Field(default="1.0.0", alias="MIN_SUPPORTED_APP_VERSION")
    ios_store_url: str = Field(default="", alias="IOS_STORE_URL")
    android_store_url: str = Field(default="", alias="ANDROID_STORE_URL")

    @property
    def telegram_allowed_user_ids(self) -> set[str]:
        return {
            item.strip()
            for item in self.telegram_allowed_user_ids_raw.split(",")
            if item.strip()
        }

    @property
    def jwt_secret(self) -> str:
        return self.customer_jwt_secret or f"customer:{self.dashboard_secret_key}"

    @property
    def bonus_levels(self) -> list[dict]:
        levels = []
        for chunk in self.bonus_levels_raw.split(","):
            title, threshold, percent = chunk.split(":")
            levels.append({"title": title.strip(), "threshold": int(threshold), "percent": int(percent)})
        return sorted(levels, key=lambda level: level["threshold"])

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
