"""Prints the API's OpenAPI schema as JSON, for generating frontend types.

    uv run python -m scripts.export_openapi > openapi.json

Needs no .env and makes no network calls: the schema does not depend on any
setting, so placeholders stand in for the required ones.
"""

import json
import os
import sys

PLACEHOLDERS = {
    "GEMINI_API_KEY": "unused",
    "TAVILY_API_KEY": "unused",
    "SUPABASE_URL": "https://unused.supabase.co",
    "SUPABASE_ANON_KEY": "unused",
}


def main() -> None:
    os.environ["WANDERMIND_ENV_FILE"] = os.devnull
    os.environ.update(PLACEHOLDERS)

    from app.main import create_app

    schema = create_app().openapi()
    json.dump(schema, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
