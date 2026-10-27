from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes import auth, health, storefront
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.auth import ensure_bootstrap_operator


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = SessionLocal()
    try:
        ensure_bootstrap_operator(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

WEB_DIR = Path(__file__).resolve().parent / "web"

app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith(("/static", "/api/v1/store")):
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


app.include_router(storefront.router)
app.include_router(auth.router)
app.include_router(health.router)
