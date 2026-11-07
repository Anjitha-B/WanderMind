# Database setup

The schema lives in [`supabase/migrations/`](./supabase/migrations). Apply migrations with the Supabase CLI instead of pasting SQL. Commands run from the repo root, and `npx supabase` needs no global install.

| Migration | Purpose |
|---|---|
| `20261106000000_initial_schema.sql` | Baseline: the schema as it exists on the live project |
| `20261106000100_harden_functions_and_constraints.sql` | Trigger function hardening and CHECK constraints |

## A new project

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## The existing live project

The tables already exist there, so the baseline must be recorded as applied without running. Only the second migration runs.

**1. Generate the baseline in a throwaway directory.**

`db pull` will not run alongside local migrations that the remote history has not recorded, so it has to run outside this repo. It also writes a row to the remote migration history without prompting, and the next step removes that row.

```bash
mkdir /tmp/wandermind-baseline && cd /tmp/wandermind-baseline
npx supabase init
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db pull
PULLED=$(ls supabase/migrations/*_remote_schema.sql)
PULLED_VERSION=$(basename "$PULLED" | cut -d_ -f1)
npx supabase migration repair --status reverted "$PULLED_VERSION"
```

**2. Replace the baseline in this repo with the pulled file, keeping the baseline's name.**

```bash
cp "$PULLED" <repo>/supabase/migrations/20261106000000_initial_schema.sql
```

**3. Mark the baseline as applied.** Run this from the repo: `migration repair` fails if the migration file is not in the current directory.

```bash
cd <repo>
npx supabase link --project-ref <project-ref>
npx supabase migration repair --status applied 20261106000000
npx supabase migration list
```

Stop here unless `migration list` shows `20261106000000` on **both** the local and remote sides and `20261106000100` on the local side only. If the baseline is missing from the remote side, `db push` will try to run it.

**4. Check existing rows.** Run [`supabase/preflight_constraints.sql`](./supabase/preflight_constraints.sql) in the SQL Editor. It is read-only and reports violations per constraint.

The migration handles either result. It adds each constraint as `NOT VALID`, then validates those with no violating rows. A constraint with violations stays `NOT VALID`: new writes must pass it, and existing rows are left alone. Migrations never change or delete rows.

**5. Apply the second migration.**

```bash
npx supabase db push
```

## Local development

```bash
npx supabase start
npx supabase db reset
```

`db reset` rebuilds the local database from the migrations. It only affects the local stack.
