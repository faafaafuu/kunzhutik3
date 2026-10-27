from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="Kunzhut Delivery", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    app_base_url: str = Field(default="http://localhost:8000", alias="APP_BASE_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    database_url: str = Field(alias="DATABASE_URL")

    telegram_bot_token: str | None = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_webapp_base_url: str | None = Field(default=None, alias="TELEGRAM_WEBAPP_BASE_URL")
    # Staff accounts that receive new-order notifications and may change order status.
    telegram_allowed_user_ids_raw: str = Field(default="", alias="TELEGRAM_ALLOWED_USER_IDS")

    dashboard_secret_key: str = Field(default="change-me-dashboard-secret", alias="DASHBOARD_SECRET_KEY")
    dashboard_cookie_name: str = Field(default="delivery_dashboard_session", alias="DASHBOARD_COOKIE_NAME")
    dashboard_bootstrap_username: str | None = Field(default=None, alias="DASHBOARD_BOOTSTRAP_USERNAME")
    dashboard_bootstrap_password: str | None = Field(default=None, alias="DASHBOARD_BOOTSTRAP_PASSWORD")
    dashboard_bootstrap_role: str = Field(default="admin", alias="DASHBOARD_BOOTSTRAP_ROLE")

    @property
    def telegram_allowed_user_ids(self) -> set[str]:
        return {
            item.strip()
            for item in self.telegram_allowed_user_ids_raw.split(",")
            if item.strip()
        }


settings = Settings()
