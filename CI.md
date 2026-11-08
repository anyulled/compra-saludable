# CI and database changes

The pull-request checks build the app, run its Node tests, exercise the Supabase schema on a disposable local stack, enforce **90% global line coverage**, and enforce a **CRAP score of 10 or less for every function**. C8 runs with `--all` and a TypeScript-aware loader, so unexecuted `.ts` and `.tsx` files remain in the denominator at 0% instead of disappearing from the report. Type-only `lib/types.ts`, `lib/storage/contract.ts`, and declaration files are excluded because they emit no runtime behavior. See [the architecture guide](docs/arquitectura.md) and [the optimizer model](docs/optimizacion.md) for diagrams and design rationale.

The latest local coverage run passed with **93.02% line coverage** (83.45% branches and 81.86% functions); the production build also passed. The threshold is a line-coverage threshold, not a branch or function threshold.

For Supabase, CI starts a fresh local stack in a temporary directory, copies in the tracked migrations, runs `supabase db push --dry-run`, applies those migrations to the disposable database, then executes `supabase/tests/household_isolation.sql` with `psql`. The SQL test rolls back its fixtures. Pull-request jobs have no remote project credentials. The remote migration job is in the same workflow, runs only on a push to `main`, and depends on the build, global coverage, CRAP gate, and local database jobs; it previews pending migrations and then applies them remotely.

## Remote deploy configuration

The `production` GitHub environment needs these values:

- Secret `SUPABASE_ACCESS_TOKEN`: a Supabase access token scoped to the target project and the permissions required for database migrations.
- Secret `SUPABASE_DB_PASSWORD`: the target project's database password.
- Variable `SUPABASE_PROJECT_REF`: the project reference from the Supabase project URL.

The remote deploy workflow has not been exercised against a hosted project here; it requires those environment values. Do not add these secrets to pull-request workflows. Deployments are serialized and omit seed data and vault secrets.

## Dependabot auto-merge

Dependabot groups patch/minor updates by Next/React, Supabase, PDF/OCR, and Node tooling families; major updates are grouped separately. Its `pull_request_target` workflow checks only the Dependabot author and does not check out or execute PR code. `gh pr merge --auto --rebase` queues the merge so GitHub can wait for required checks. Enable auto-merge and rebase in repository settings, and require `build-and-test`, `coverage`, and `database-integration` on `main`; this workflow does not alter branch protection or rulesets.
