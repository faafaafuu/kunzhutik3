from decimal import ROUND_HALF_UP, Decimal

from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """An error the client is expected to handle by `code` (docs/api.md, «Коды ошибок»)."""

    def __init__(self, code: str, message: str, *, status: int = 400, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


CENT = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def money_str(value) -> str:
    """Money travels as a string with two decimals: "350.00"."""
    return f"{money(value):.2f}"
