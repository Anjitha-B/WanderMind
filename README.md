# WanderMind

[![CI](https://github.com/Anjitha-B/WanderMind/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Anjitha-B/WanderMind/actions/workflows/ci.yml)

**AI travel itinerary planner with live web grounding**

WanderMind takes a destination, travel dates, and a list of interests and returns a day-by-day itinerary. Before it writes the plan, the model can search the live web through Tavily to check things that go stale quickly, like opening hours, whether a venue is still operating, and events happening on your dates. Signed-in users can save trips, edit them later, and delete them.

Built with Next.js, FastAPI, Google Gemini, Tavily, and Supabase.

---

## Why I built this

LLMs are good at structure and bad at freshness. A model can write a convincing plan around a museum that closed last year or a festival that moved to a different month. I wanted to build a customer-facing AI app end to end and deal with that problem directly: API design, LLM orchestration, tool calling, output handling, auth, and persistence.

It is also the kind of solution I would scope, build, and demo in a Solutions Engineering or Forward Deployed Engineering role.

---

## Features

- Generate a multi-day itinerary from destination, date range, and interests
- Live web lookups during generation (Tavily) for opening hours, venue status, and local events
- Email auth with Supabase
- Save itineraries to your account
- View past trips, edit activities, and delete trips
- User profile page (home country, preferred currency, travel preferences)

---

## How it works

```mermaid
sequenceDiagram
    participant U as Next.js (browser)
    participant API as FastAPI
    participant G as Gemini
    participant T as Tavily
    participant DB as Supabase (Postgres)

    U->>API: POST /api/v1/itineraries/generate (Bearer token)
    API->>API: Verify JWT against Supabase JWKS, check rate limit
    API->>G: Research call: prompt + search_travel_info tool
    loop Up to 3 lookups
        G->>API: Function call: search_travel_info(query)
        API->>T: get_search_context(query)
        T-->>API: Condensed web results
        API-->>G: Search context
    end
    G-->>API: Draft plan
    API->>G: Final call: whole conversation + response schema, tools off
    G-->>API: Itinerary JSON
    API-->>U: Validated itinerary
    U->>API: POST /api/v1/trips (Bearer token)
    API->>DB: Insert as the user, so RLS applies
```

### Authentication

1. The browser signs in with Supabase and receives an access token. Every API call sends it as `Authorization: Bearer <token>`, through `frontend/utils/api.ts`.
2. FastAPI verifies the token locally. Supabase signs tokens for this project with ES256, so the backend checks the signature against the public key from the JWKS endpoint (cached) and validates `exp`, `aud`, and `iss`. The accepted algorithm is fixed in code.
3. The user ID comes only from the token's `sub` claim. The browser never sends a `user_id`, and a request body containing one is rejected with a 422.
4. For each request the backend creates a Supabase client with the anon key and the user's token, so Postgres runs the query as that user and Row Level Security applies. The service role key is not used by the application.

Queries also filter on `user_id`, as a second layer on top of RLS. An unknown trip and someone else's trip both return 404.

`/home`, `/trips`, and `/profile` share a client-side session check, `useRequireAuth`. It controls what the UI shows. The protection for data is the API and RLS.

### The agentic tool layer (Tavily)

The backend exposes one tool to Gemini, `search_travel_info(query)`, which wraps Tavily's `get_search_context`. It is passed to the Google GenAI SDK as a plain Python function, so the SDK builds the function declaration from the signature and docstring and runs the call loop automatically, up to 3 calls per request. The model decides when to search and what to search for, and the prompt tells it to verify opening hours, venue status, and events for the specific travel dates.

Generation runs in two phases. In the research phase the model searches and writes a draft plan. The final phase is a separate Gemini call with tools off and a response schema, and it receives the whole research conversation: the searches, their results, and the draft. That keeps the itinerary grounded in what the searches found. If the model reaches the search cap while still asking to search, the final call is written from the results so far.

A few decisions worth calling out:

- **The model chooses the queries.** There is no hardcoded list of lookups. A food trip to Tokyo and a hiking trip to Banff lead to very different searches.
- **Search failures degrade instead of crashing.** If Tavily errors out, the tool returns a generic message to the model, the details go to the server logs, and generation continues with the model's own knowledge.
- **`get_search_context` instead of raw search results.** It returns compact, LLM-ready context, which keeps token usage down across multiple tool calls.
- **Structured output, validated.** The final call uses Gemini's JSON mode with a schema generated from the `ItineraryResponse` Pydantic model, and the reply is validated with that same model. Invalid output is retried once, then the API returns a 502. Gemini rejects schemas that carry size bounds (`maxItems`, `maxLength` and similar), so the schema it receives describes structure only; the limits are stated in the prompt and enforced by validation.
- **Call budget.** A generation makes at most 3 research calls, 1 final call, and 1 retry of the final call, with at most 3 Tavily searches.
- **User input and search results are treated as data.** Trip details go in a delimited block of the prompt, and the system instruction tells the model not to follow instructions found there or in tool results. This reduces prompt injection risk but cannot rule it out.

### Architecture notes

- **Separate frontend and backend.** Next.js runs on port 3000 and FastAPI on port 8000. The Gemini and Tavily keys live only on the backend. The browser holds only the Supabase anon key, which is safe to expose when RLS is on.
- **Validation.** Pydantic validates requests and model output, including limits on days, activities, and text lengths, and a trip cap on generate and save (14 days by default). Unknown fields are rejected.
- **Database constraints.** CHECK constraints cap itinerary and profile sizes in Postgres, so the limits on size also apply to writes that skip FastAPI and go straight to PostgREST.
- **Rate limits.** Generation is limited per user, 5 per minute and 30 per day by default. The health endpoints are exempt.
- **Configuration.** The model name, rate limits, trip cap, search cap, and timeouts are settings with defaults. See `backend/.env.example`.
- **JSONB storage.** Each trip's multi-day plan is stored in a single `itinerary_data` JSONB column, which fits the nested day and activity structure without extra join tables.
- **Row Level Security.** RLS policies on `profiles` and `itineraries` limit authenticated users to their own rows, for requests through FastAPI and for the profile page, which talks to Supabase directly.
- **Database triggers.** A trigger creates a profile row when a user signs up, and another keeps `modified_at` current on profile edits.
- **Errors.** Clients get a generic message and a request ID. Details stay in the server logs under that ID.
- **Logging.** The backend writes structured JSON to stdout, with hashed user IDs and no destinations, interests, or activities.

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js (Pages Router), React, TypeScript (strict), Tailwind CSS v4, react-date-range |
| Frontend tooling | ESLint (Next config), Prettier, Vitest, React Testing Library, openapi-typescript |
| Auth and data client | `@supabase/ssr`, `@supabase/supabase-js`, `@supabase/auth-ui-react` |
| Backend | Python 3.13, FastAPI, Pydantic, Uvicorn, PyJWT, slowapi |
| Backend tooling | uv, ruff, pytest, pip-audit, pre-commit with gitleaks |
| LLM | Google Gemini via the `google-genai` SDK, with automatic function calling and structured output |
| Live web search | Tavily (`tavily-python`) |
| Database | Supabase Postgres with JSONB, RLS policies, and PL/pgSQL triggers |

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/itineraries/generate` | Generate an itinerary (with live web lookups) |
| GET | `/api/v1/trips` | List your saved trips, newest first |
| POST | `/api/v1/trips` | Save a generated itinerary |
| PATCH | `/api/v1/trips/{trip_id}` | Update the activities in a saved trip |
| DELETE | `/api/v1/trips/{trip_id}` | Delete a saved trip |
| GET | `/healthz` | Liveness: the process is serving requests |
| GET | `/readyz` | Readiness: the app started with valid settings |

Every `/api/v1` endpoint needs an `Authorization: Bearer <access_token>` header. The two health endpoints need no auth, touch no database or external service, and are not rate limited. With the backend running, interactive docs are at `http://localhost:8000/docs`.

---

## Local setup

### Prerequisites

- Node.js 20.9+
- [uv](https://docs.astral.sh/uv/), which installs Python 3.13 for the backend
- A free [Supabase](https://supabase.com) project
- A [Google AI Studio](https://aistudio.google.com) API key
- A [Tavily](https://tavily.com) API key (the free tier is enough for development)

### 1. Database

Apply the migrations in `supabase/migrations/` with the Supabase CLI. See [setup.md](./setup.md).

### 2. Environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Fill in both files. The backend will not start without `GEMINI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. `ALLOWED_ORIGINS` is a comma-separated list of frontend origins. Both env files are gitignored.

### 3. Backend

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
```

`uv sync` creates `backend/.venv` from `uv.lock`. Dependencies are declared in `backend/pyproject.toml`.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Tests

### Unit tests

```bash
cd backend
uv run pytest
```

These need no network, Docker, or real credentials. Sockets are disabled during the run, and tokens are signed with a test key and checked by the real verifier.

### Frontend unit tests

```bash
cd frontend
npm test
```

Vitest and React Testing Library cover `apiFetch` (token attached, 401 redirects to `/login`, 422 errors formatted for people), the `useRequireAuth` hook, the profile name validator, and the itinerary edit helpers.

### Integration tests

These run against a local Supabase stack and need Docker. They sign up two real users, then prove RLS blocks cross-user access using raw PostgREST calls with no `user_id` filter, and that CHECK constraints reject oversized data written directly with a user token. One suite runs the whole chain through FastAPI.

From the repo root:

```bash
npx supabase start
npx supabase db reset
export SUPABASE_TEST_ANON_KEY=$(npx supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
cd backend
uv run pytest -m integration
```

They are skipped by a plain `pytest`.

### Live smoke test

One test generates a 2-day itinerary through the real Gemini and Tavily APIs, using the keys in `backend/.env`, and prints the searches next to the result. It spends real quota, so it only runs when asked for:

```bash
cd backend
uv run pytest -m live -s
```

### End-to-end tests

Playwright drives the real frontend and API against the local Supabase stack. It covers sign-up, login, generation, save, edit, the two-step delete, logout with the Back button, and a second account that cannot see or change the first account's trips. Gemini and Tavily are replaced with a deterministic fake (`e2e/e2e_server.py`); everything else is real.

With the local stack running and `SUPABASE_TEST_ANON_KEY` exported as above:

```bash
cd e2e
npm install
npx playwright install chromium
npx playwright test
```

The API is started with `uv run`, so run `uv sync` in `backend/` first. The run builds the frontend into `frontend/.next` with local settings, so rebuild before using `next start` against your real project.

---

## Code quality

```bash
cd backend
uv run ruff check . ../e2e
uv run ruff format --check . ../e2e
uv export --frozen --no-emit-project -o /tmp/requirements.txt && uv run pip-audit -r /tmp/requirements.txt --require-hashes --disable-pip
```

```bash
cd frontend
npm run typecheck
npm run lint
npm run format:check
npm run check:api
npm run build
```

### Checks

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs these on every pull request to `main` and every push to `main`. They need no repository secrets and never call the real Gemini, Tavily, or Supabase.

- **backend**: ruff lint and format check, unit tests with sockets disabled, and `pip-audit` on the locked dependencies.
- **frontend**: typecheck, lint, Prettier check, Vitest, the API types check, `next build`, and `npm audit --omit=dev --audit-level=high`.
- **secrets**: gitleaks over the full git history.
- **integration-e2e**: starts a local Supabase stack, then runs `pytest -m integration` and the Playwright suite against the fake Gemini server.

Tests marked `live` never run in CI. Dependabot opens weekly dependency updates, and CodeQL scans Python, JavaScript/TypeScript, and the workflow files.

### API types

`frontend/types/api.ts` is generated from the FastAPI OpenAPI schema with openapi-typescript, so the frontend's request and response types cannot drift from the backend's Pydantic models. After changing a schema or route in `backend/app`:

```bash
cd frontend
npm run generate:api    # rewrite types/api.ts
npm run check:api       # exits 1 if the committed file is out of date
```

Both read the schema from the backend code through `uv`, with no server or `.env` needed.

### Pre-commit

Pre-commit runs ruff, [gitleaks](https://github.com/gitleaks/gitleaks), Prettier, and the API types check on each commit. Install the hook once per clone:

```bash
cd backend
uv run pre-commit install
```

---

## Known limitations and roadmap

I would rather list these than have someone find them:

- **Rate limits are per process.** Counters live in memory, so they reset on restart and multiply with each worker. A shared store is needed before scaling out.
- **Tokens stay valid until they expire.** Tokens are verified locally, so signing out does not revoke one that has already been issued.
- **Field-level limits only apply through FastAPI.** Users can write to their own rows directly through PostgREST with the anon key. RLS keeps them out of other users' data and CHECK constraints cap total size, but per-activity limits are only enforced by the API.
- **Older trips can exceed the limits.** Trips saved before validation existed still load, but editing one that breaks a limit returns a 422 until it is trimmed.
- **Source visibility.** Search results inform the itinerary but are not shown to the user. Returning source links per activity would make the output easier to trust and check.
- **Tool use is not guaranteed.** The model decides whether to search, so a trip can be generated with zero lookups. Logging tool calls per request would make this measurable.
- **Blocking calls.** Endpoints are synchronous, so a long generation with several searches holds a worker. Moving to async clients would help under load.

---

## Author

**Anjitha Balachandran**
[LinkedIn](https://www.linkedin.com/in/anjitha-balachandran-673b62146/) · [Email](mailto:2011anjitha@gmail.com)
