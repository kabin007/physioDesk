"""Shared schema building blocks: base config, reusable field types, pagination, errors."""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import time
from typing import Annotated, Any, ClassVar, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    model_validator,
)


class APIModel(BaseModel):
    """Base for request bodies: reject unknown fields so typos fail loudly."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PatchModel(APIModel):
    """Base for PATCH bodies: every field optional, only fields actually sent are applied.

    Sending `null` is only allowed for fields listed in `nullable_fields`; for everything
    else it is rejected here rather than failing later on a NOT NULL column.
    """

    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _reject_nulls(self) -> Self:
        for name in self.model_fields_set:
            if getattr(self, name) is None and name not in self.nullable_fields:
                raise ValueError(f"'{name}' cannot be null")
        return self

    def changes(self) -> dict[str, object]:
        return self.model_dump(exclude_unset=True)


class ORMModel(BaseModel):
    """Base for response models built from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


# Whitespace-stripped, non-empty strings bounded to their column sizes.
Text120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text255 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


# Digits with optional leading "+", spaces, dashes and parentheses; 7-20 characters.
Phone = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=7, max_length=20, pattern=r"^\+?[0-9][0-9 ()\-]{5,18}$"
    ),
]


def _whole_minutes(value: time) -> time:
    if value.tzinfo is not None:
        raise ValueError("times are clinic-local wall-clock values; omit the UTC offset")
    if value.second or value.microsecond:
        raise ValueError("times must be whole minutes (HH:MM)")
    return value


# Clinic-local wall-clock time. Accepts "HH:MM" (or "HH:MM:00"), serialises as "HH:MM".
ClockTime = Annotated[
    time,
    AfterValidator(_whole_minutes),
    PlainSerializer(lambda value: value.strftime("%H:%M"), return_type=str, when_used="json"),
    Field(examples=["09:00"]),
]


# --- Pagination -------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page[T](BaseModel):
    items: list[T]
    page: int = Field(examples=[1])
    page_size: int = Field(examples=[20])
    total: int = Field(examples=[100])
    pages: int = Field(examples=[5])

    @classmethod
    def build(cls, items: Sequence[T], total: int, params: PageParams) -> "Page[T]":
        return cls(
            items=list(items),
            page=params.page,
            page_size=params.page_size,
            total=total,
            pages=math.ceil(total / params.page_size) if total else 0,
        )


# --- Errors (documentation only; bodies are produced by app.core.exceptions) -------------


class ErrorDetail(BaseModel):
    code: str = Field(examples=["APPOINTMENT_CONFLICT"])
    message: str = Field(examples=["Therapist already has an appointment during this time."])


class ErrorResponse(BaseModel):
    detail: ErrorDetail


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI `responses=` entries documenting the shared error body for these codes."""
    return {code: {"model": ErrorResponse} for code in status_codes}
