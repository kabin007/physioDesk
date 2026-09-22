from sqlalchemy import Boolean, Enum, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import UserRole
from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # Stored lower-cased by the service layer, so the unique index is effectively
    # case-insensitive without needing citext.
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    # Embedded in every JWT; bumping it revokes all outstanding tokens for the user
    # (used by logout). Stateless revocation without a token store.
    token_version: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.role})>"
