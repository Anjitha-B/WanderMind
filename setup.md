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

Every command that targets the live project needs `--remote`. Without it, the CLI targets the local stack.

**1. Generate the baseline (done on 2026-11-07).**

`20261106000000_initial_schema.sql` is the output of `db pull --remote` against the live project. To regenerate it, work in a throwaway directory: `db pull` refuses to run alongside local migrations that the remote history has not recorded. It also writes a row to the remote migration history, which the last command removes.

```bash
mkdir /tmp/wandermind-baseline && cd /tmp/wandermind-baseline
npx supabase init
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db pull --remote
PULLED=$(ls supabase/migrations/*_remote_schema.sql)
PULLED_VERSION=$(basename "$PULLED" | cut -d_ -f1)
npx supabase migration repair --status reverted "$PULLED_VERSION" --remote
cp "$PULLED" <repo>/supabase/migrations/20261106000000_initial_schema.sql
```

**2. Check existing rows.** [`supabase/preflight_constraints.sql`](./supabase/preflight_constraints.sql) is read-only and reports violations per constraint:

```bash
npx supabase db query --remote --read-only -f supabase/preflight_constraints.sql
```

The migration handles either result. It adds each constraint as `NOT VALID`, then validates those with no violating rows. A constraint with violations stays `NOT VALID`: new writes must pass it, and existing rows are left alone. Migrations never change or delete rows.

**3. Mark the baseline as applied.** Run from the repo: `migration repair` fails if the migration file is not in the current directory.

```bash
cd <repo>
npx supabase link --project-ref <project-ref>
npx supabase migration repair --status applied 20261106000000 --remote
npx supabase migration list --remote
```

Stop here unless `migration list` shows `20261106000000` on **both** the local and remote sides and `20261106000100` on the local side only. If the baseline is missing from the remote side, `db push` will try to run it.

**4. Apply the second migration.** Check the dry run lists only `20261106000100`:

```bash
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

## Local development

```bash
npx supabase start
npx supabase db reset
```

`db reset` rebuilds the local database from the migrations. It only affects the local stack.
