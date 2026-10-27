from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=255)


class OperatorMe(BaseModel):
    id: UUID
    username: str
    role: str


class LoginResponse(BaseModel):
    user: OperatorMe
