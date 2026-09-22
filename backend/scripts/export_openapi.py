"""Print the OpenAPI schema as JSON (used to generate the frontend's TypeScript types).

uv run python -m scripts.export_openapi > ../frontend/openapi.json
"""

import json
import os
import sys

# The schema does not depend on real configuration; placeholders let this run anywhere.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/placeholder")
os.environ.setdefault("JWT_SECRET_KEY", "placeholder-secret-for-schema-export-only-000")

from app.main import app

json.dump(app.openapi(), sys.stdout, indent=2)
sys.stdout.write("\n")
