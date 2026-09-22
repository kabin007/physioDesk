.DEFAULT_GOAL := help
.PHONY: help env install dev run migrate migration downgrade seed seed-reset test test-cov \
        lint format typecheck check clean db-up db-down docker-up docker-down

UV  ?= uv
RUN := $(UV) run

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example with a freshly generated JWT secret
	@test -f .env && echo ".env already exists; leaving it untouched" || \
		(sed "s|^JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')|" \
			.env.example > .env && echo "Created .env")

install: ## Install runtime and dev dependencies (uv sync)
	$(UV) sync

dev: ## Run the API with auto-reload on http://localhost:8000
	$(RUN) fastapi dev app/main.py --port 8000

run: ## Run the API without reload
	$(RUN) fastapi run app/main.py --port 8000

migrate: ## Apply all migrations
	$(RUN) alembic upgrade head

migration: ## Autogenerate a migration: make migration name="add something"
	@test -n "$(name)" || (echo 'usage: make migration name="description"' && exit 1)
	$(RUN) alembic revision --autogenerate -m "$(name)"

downgrade: ## Roll back the latest migration
	$(RUN) alembic downgrade -1

seed: ## Seed demo data (safe to re-run)
	$(RUN) python -m scripts.seed

seed-reset: ## Wipe clinic data (keeps users) and reseed
	$(RUN) python -m scripts.seed --reset

test: ## Run the test suite (uses a separate *_test database)
	$(RUN) pytest

test-cov: ## Run tests with a coverage report
	$(RUN) pytest --cov --cov-report=term-missing

lint: ## Lint with Ruff
	$(RUN) ruff check .

format: ## Format code and apply safe lint fixes
	$(RUN) ruff format .
	$(RUN) ruff check --fix .

typecheck: ## Static type checking with mypy
	$(RUN) mypy app scripts tests

check: ## All quality gates: lint, format check, types, tests
	$(RUN) ruff check .
	$(RUN) ruff format --check .
	$(RUN) mypy app scripts tests
	$(RUN) pytest

clean: ## Remove caches and coverage artefacts
	rm -rf .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov
	find . -type d -name __pycache__ -not -path './.venv/*' -exec rm -rf {} +

db-up: ## Start PostgreSQL in Docker (port 5433) and wait until healthy
	docker compose up -d --wait db

db-down: ## Stop the Docker services (data volume is kept)
	docker compose down

docker-up: ## Build and run PostgreSQL + API in Docker (API on :8000)
	docker compose --profile full up -d --build --wait

docker-down: ## Stop all Docker services (data volume is kept)
	docker compose --profile full down
