import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import account, admin, auth, client_app, health, legal, public, social
from app.core.config import settings
from app.core.errors import ApiError, api_error_handler
from app.db.session import SessionLocal
from app.services.auth import ensure_bootstrap_operator
from app.services.seed import seed

logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = SessionLocal()
    try:
        ensure_bootstrap_operator(db)
        if settings.seed_demo_data:
            seed(db)
    finally:
        db.close()
    yield


app = FastAPI(title=f"{settings.app_name} API", lifespan=lifespan)

WEB_DIR = Path(__file__).resolve().parent / "web"

# The mobile app calls the API from its own origin in development (Expo dev server).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(ApiError, api_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": "Проверьте введённые данные",
                "details": {"fields": [{"loc": list(err["loc"]), "msg": err["msg"]} for err in exc.errors()]},
            }
        },
    )


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(public.router)
app.include_router(account.router)
app.include_router(social.router)
app.include_router(admin.router)
app.include_router(legal.router)
# Last: catches every other GET for the client app.
app.include_router(client_app.router)
