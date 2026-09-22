"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-22

Generated with `alembic revision --autogenerate`, then reviewed and extended by hand with
what autogenerate cannot express: extensions, the invoice number sequence and shared enum
types (payment_method is used by two tables and must be created exactly once).
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Enum types are created explicitly up-front; columns reference them with create_type=False.
user_role = postgresql.ENUM("ADMIN", "STAFF", name="user_role", create_type=False)
gender = postgresql.ENUM("MALE", "FEMALE", "OTHER", name="gender", create_type=False)
patient_status = postgresql.ENUM(
    "ACTIVE", "COMPLETED", "ON_HOLD", name="patient_status", create_type=False
)
appointment_status = postgresql.ENUM(
    "BOOKED", "COMPLETED", "CANCELLED", name="appointment_status", create_type=False
)
session_type = postgresql.ENUM(
    "ASSESSMENT", "TREATMENT", "FOLLOW_UP", name="session_type", create_type=False
)
payment_method = postgresql.ENUM(
    "CASH", "CARD", "BANK_TRANSFER", "OTHER", name="payment_method", create_type=False
)
invoice_status = postgresql.ENUM("PAID", "DUE", "VOID", name="invoice_status", create_type=False)

ENUMS = (
    user_role,
    gender,
    patient_status,
    appointment_status,
    session_type,
    payment_method,
    invoice_status,
)

APPOINTMENT_RANGE = "tsrange(appointment_date + start_time, appointment_date + end_time, '[)')"


def _timestamps() -> list[sa.Column[Any]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    ]


def _id() -> sa.Column[Any]:
    return sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False)


def upgrade() -> None:
    # btree_gist: lets the appointment exclusion constraints combine `=` on a UUID with `&&`
    # on a time range. pg_trgm: substring search on patient name/phone.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    bind = op.get_bind()
    for enum in ENUMS:
        enum.create(bind, checkfirst=True)

    op.execute("CREATE SEQUENCE invoice_number_seq")

    # --- users ------------------------------------------------------------------------
    op.create_table(
        "users",
        _id(),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("token_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # --- therapists -------------------------------------------------------------------
    op.create_table(
        "therapists",
        _id(),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("specialty", sa.String(length=120), nullable=False),
        sa.Column("working_days", postgresql.ARRAY(sa.SmallInteger()), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("slot_duration_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "cardinality(working_days) >= 1 AND working_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]",
            name=op.f("ck_therapists_working_days_valid"),
        ),
        sa.CheckConstraint(
            "slot_duration_minutes > 0 AND slot_duration_minutes <= 480",
            name=op.f("ck_therapists_slot_duration_range"),
        ),
        sa.CheckConstraint(
            "start_time < end_time", name=op.f("ck_therapists_working_hours_order")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_therapists")),
    )
    op.create_index(op.f("ix_therapists_is_active"), "therapists", ["is_active"])

    # --- therapist_schedule_overrides -------------------------------------------------
    op.create_table(
        "therapist_schedule_overrides",
        _id(),
        sa.Column("therapist_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("is_day_off", sa.Boolean(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "(is_day_off AND start_time IS NULL AND end_time IS NULL)"
            " OR (NOT is_day_off AND start_time IS NOT NULL AND end_time IS NOT NULL"
            " AND start_time < end_time)",
            name=op.f("ck_therapist_schedule_overrides_day_off_or_hours"),
        ),
        sa.ForeignKeyConstraint(
            ["therapist_id"],
            ["therapists.id"],
            name=op.f("fk_therapist_schedule_overrides_therapist_id_therapists"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_therapist_schedule_overrides")),
        sa.UniqueConstraint("therapist_id", "date", name="uq_schedule_override_therapist_date"),
    )

    # --- patients ---------------------------------------------------------------------
    op.create_table(
        "patients",
        _id(),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("age", sa.SmallInteger(), nullable=False),
        sa.Column("gender", gender, nullable=False),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("condition", sa.String(length=255), nullable=False),
        sa.Column("assigned_therapist_id", sa.UUID(), nullable=True),
        sa.Column("package", sa.String(length=120), nullable=True),
        sa.Column("status", patient_status, server_default="ACTIVE", nullable=False),
        *_timestamps(),
        sa.CheckConstraint("age > 0 AND age <= 130", name=op.f("ck_patients_age_range")),
        sa.ForeignKeyConstraint(
            ["assigned_therapist_id"],
            ["therapists.id"],
            name=op.f("fk_patients_assigned_therapist_id_therapists"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_patients")),
    )
    op.create_index(
        op.f("ix_patients_assigned_therapist_id"), "patients", ["assigned_therapist_id"]
    )
    op.create_index("ix_patients_created_at", "patients", ["created_at"])
    op.create_index(op.f("ix_patients_status"), "patients", ["status"])
    op.create_index(
        "ix_patients_full_name_trgm",
        "patients",
        ["full_name"],
        postgresql_using="gin",
        postgresql_ops={"full_name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_patients_phone_trgm",
        "patients",
        ["phone"],
        postgresql_using="gin",
        postgresql_ops={"phone": "gin_trgm_ops"},
    )

    # --- appointments -----------------------------------------------------------------
    op.create_table(
        "appointments",
        _id(),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("therapist_id", sa.UUID(), nullable=False),
        sa.Column("appointment_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("status", appointment_status, server_default="BOOKED", nullable=False),
        sa.Column("session_type", session_type, server_default="TREATMENT", nullable=False),
        sa.Column("payment_method", payment_method, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("start_time < end_time", name=op.f("ck_appointments_time_order")),
        # No two active (non-cancelled) appointments may overlap for one therapist/patient.
        postgresql.ExcludeConstraint(
            (sa.column("therapist_id"), "="),
            (sa.text(APPOINTMENT_RANGE), "&&"),
            where=sa.text("status <> 'CANCELLED'"),
            using="gist",
            name="ex_appointments_therapist_no_overlap",
        ),
        postgresql.ExcludeConstraint(
            (sa.column("patient_id"), "="),
            (sa.text(APPOINTMENT_RANGE), "&&"),
            where=sa.text("status <> 'CANCELLED'"),
            using="gist",
            name="ex_appointments_patient_no_overlap",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name=op.f("fk_appointments_patient_id_patients"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["therapist_id"],
            ["therapists.id"],
            name=op.f("fk_appointments_therapist_id_therapists"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_appointments")),
    )
    op.create_index(
        op.f("ix_appointments_appointment_date"), "appointments", ["appointment_date"]
    )
    op.create_index(op.f("ix_appointments_patient_id"), "appointments", ["patient_id"])
    op.create_index(op.f("ix_appointments_status"), "appointments", ["status"])
    op.create_index(
        "ix_appointments_therapist_date", "appointments", ["therapist_id", "appointment_date"]
    )

    # --- invoices ---------------------------------------------------------------------
    op.create_table(
        "invoices",
        _id(),
        sa.Column("invoice_number", sa.String(length=32), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("service", sa.String(length=200), nullable=False),
        sa.Column("subtotal", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "discount", sa.Numeric(precision=12, scale=2), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "total",
            sa.Numeric(precision=12, scale=2),
            sa.Computed("subtotal - discount", persisted=True),
            nullable=False,
        ),
        sa.Column("status", invoice_status, nullable=False),
        sa.Column("payment_method", payment_method, nullable=True),
        sa.Column(
            "issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint("subtotal >= 0", name=op.f("ck_invoices_subtotal_non_negative")),
        sa.CheckConstraint("discount >= 0", name=op.f("ck_invoices_discount_non_negative")),
        sa.CheckConstraint(
            "discount <= subtotal", name=op.f("ck_invoices_discount_not_above_subtotal")
        ),
        sa.CheckConstraint(
            "status <> 'PAID' OR (paid_at IS NOT NULL AND payment_method IS NOT NULL)",
            name=op.f("ck_invoices_paid_requires_payment_details"),
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            name=op.f("fk_invoices_patient_id_patients"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoices")),
        sa.UniqueConstraint("invoice_number", name=op.f("uq_invoices_invoice_number")),
    )
    op.create_index(op.f("ix_invoices_issued_at"), "invoices", ["issued_at"])
    op.create_index(op.f("ix_invoices_paid_at"), "invoices", ["paid_at"])
    op.create_index(op.f("ix_invoices_patient_id"), "invoices", ["patient_id"])
    op.create_index(op.f("ix_invoices_status"), "invoices", ["status"])


def downgrade() -> None:
    # Dropping a table drops its indexes and constraints with it.
    op.drop_table("invoices")
    op.drop_table("appointments")
    op.drop_table("patients")
    op.drop_table("therapist_schedule_overrides")
    op.drop_table("therapists")
    op.drop_table("users")
    op.execute("DROP SEQUENCE IF EXISTS invoice_number_seq")

    bind = op.get_bind()
    for enum in reversed(ENUMS):
        enum.drop(bind, checkfirst=True)
    # Extensions are left installed: other objects in the database may depend on them.
