.DEFAULT_GOAL := help
.PHONY: help env install db-up db-down migrate seed seed-reset backend frontend dev \
        test lint typecheck check build api-types clean

BACKEND  := $(MAKE) -C backend
FRONTEND := cd frontend &&

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

env: ## Create backend/.env and frontend/.env.local from their examples
	@$(BACKEND) env
	@test -f frontend/.env.local && echo "frontend/.env.local already exists" || \
		(cp frontend/.env.example frontend/.env.local && echo "Created frontend/.env.local")

install: ## Install backend (uv) and frontend (npm) dependencies
	$(BACKEND) install
	$(FRONTEND) npm ci

db-up: ## Start PostgreSQL in Docker
	$(BACKEND) db-up

db-down: ## Stop PostgreSQL (data is kept)
	$(BACKEND) db-down

migrate: ## Apply database migrations
	$(BACKEND) migrate

seed: ## Load demo data (safe to re-run)
	$(BACKEND) seed

seed-reset: ## Wipe clinic data (keeps users) and reseed
	$(BACKEND) seed-reset

backend: ## Run the API on http://localhost:8000
	$(BACKEND) dev

frontend: ## Run the web app on http://localhost:3000
	$(FRONTEND) npm run dev

dev: ## Run API and web app together (Ctrl+C stops both)
	$(MAKE) -j2 backend frontend

test: ## Backend test suite
	$(BACKEND) test

lint: ## Lint backend and frontend
	$(BACKEND) lint
	$(FRONTEND) npm run lint

typecheck: ## Type-check backend and frontend
	$(BACKEND) typecheck
	$(FRONTEND) npm run typecheck

check: ## All quality gates: backend (lint, format, types, tests) + frontend (lint, types, format, build)
	$(BACKEND) check
	$(FRONTEND) npm run check

build: ## Production build of the web app
	$(FRONTEND) npm run build

api-types: ## Regenerate frontend API types from the backend OpenAPI schema
	cd backend && uv run python -m scripts.export_openapi > ../frontend/openapi.json
	$(FRONTEND) npm run gen:api

clean: ## Remove caches and build output
	$(BACKEND) clean
	rm -rf frontend/.next
