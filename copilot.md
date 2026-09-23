# Orbit Implementation Roadmap

This document turns `prd.md` into an MVP-first implementation sequence for Orbit, a Linear-like project management application.

## Current state

- Next.js 16 App Router starter using TypeScript, React, and Tailwind CSS 4.
- Product requirements are documented in `prd.md`.
- The local-first workspace and Kanban MVP is implemented.
- Billing, email, and AI integrations are not yet implemented.
- `AGENTS.md` requires consulting the installed Next.js documentation before implementation changes.

## Product direction

Orbit will provide:

- User onboarding and team creation
- Workspaces and boards
- Kanban layouts with drag-and-drop
- Team and user management
- Supabase persistence, initially running locally with Docker
- Stripe Lite and Pro subscriptions
- Resend welcome and invitation emails
- AI SDK-powered features
- shadcn/ui components
- Dark mode by default with a light-mode toggle

## Milestones

### Milestone 0 — Project foundation and decisions — Complete

**Work**

- Review the installed Next.js 16 documentation and confirm supported conventions, including the requested `proxy.ts` approach.
- Define application boundaries, route structure, environment-variable policy, and local development workflow.
- Install and configure shadcn/ui and the minimum UI primitives required by the product.
- Establish formatting, linting, type-checking, and test expectations.

**Exit criteria**

- The project structure and route boundaries are documented.
- The app has a repeatable local setup.
- Baseline lint, type-check, and build checks are clean.

**Review checkpoint**

- Confirm architecture, dependency choices, route boundaries, and data-access boundaries before building product features.

**Implementation notes**

- Architecture and route boundaries are documented in `docs/architecture.md`.
- Local setup, checks, and reset instructions are documented in `docs/local-development.md`.
- `.env.example` defines the public configuration boundary; secrets remain server-only and local.
- Shadcn-compatible configuration is in `components.json`; shared `cn` utilities and a Button primitive live in `lib/utils.ts` and `components/ui/button.tsx`.
- The installed Next.js package includes `proxy.ts` documentation examples. Orbit uses `proxy.ts` for Supabase session-cookie refresh.
- Baseline commands are `npm run lint`, `npm run typecheck`, and `npm run build`.

### Milestone 1 — Local-first workspace and task MVP — Complete

**Work**

- Define the core entities: workspace, board, column/status, task, and task metadata.
- Build the initial workspace/board shell and responsive Kanban board.
- Support creating, editing, moving, and deleting tasks.
- Include clear empty, loading, and error states.
- Use a temporary local persistence boundary before Supabase is introduced.
- Apply the dark-first visual system and light-mode toggle.

**Exit criteria**

- A user can open the app, create a board and tasks, move tasks between columns, refresh, and retain local MVP state.

**Review checkpoint**

- Review the core Kanban UX, persistence boundary, and visual direction.

**Implementation notes**

- Core types and the temporary persistence boundary live in `lib/orbit.ts`.
- MVP state is stored in browser `localStorage` under `orbit-local-mvp-v1`.
- The board supports native drag-and-drop, task create/edit/delete, board creation, search, and theme switching.
- The local adapter is intentionally isolated so it can be replaced by typed Supabase access in Milestone 2.

### Milestone 2 — Supabase persistence and onboarding — Complete

**Work**

- Run Supabase locally through Docker.
- Define migrations and schema for the MVP entities.
- Replace temporary persistence with typed Supabase data access.
- Add authentication, session handling, and authorization boundaries.
- Add onboarding and team/workspace creation.
- Add seed data and local reset instructions.

**Exit criteria**

- A new user can sign in locally, create a team/workspace, use a persisted board, and access only authorized workspace data.

**Review checkpoint**

- Review the Supabase schema, authentication, authorization, migration strategy, and seed/reset workflow.

**Implementation notes**

- Supabase SSR dependencies and typed browser/server clients live under `lib/supabase/`.
- `proxy.ts` refreshes Supabase auth cookies when the public Supabase variables are configured.
- `/login` supports email/password sign-in and sign-up; `/auth/callback` exchanges confirmation codes for sessions.
- The initial schema and RLS policies are in `supabase/migrations/20260922123000_initial_orbit.sql`.
- Local CLI/Docker setup and reset instructions are in `docs/supabase-local.md`.
- Signed-out users remain local-first; authenticated users use the typed remote data-access layer.
- The typed remote workspace loader and onboarding creator are implemented in `lib/supabase/orbit-data.ts`.
- Local Supabase is now running successfully; `supabase db reset` applied the migration and `.env.local` contains the local API URL and publishable key.
- Authenticated users now load remote workspace state and use Supabase for board/task mutations. Signed-out users retain the local-first MVP behavior.
- First-time authenticated users receive an in-app workspace creation flow.
- The local schema and RLS policies were verified with a two-user smoke test: a second user could not read the first user's workspace.
- Baseline lint, typecheck, and production build all pass after the remote integration.
- `supabase/seed.sql` is present so database resets complete without a missing-seed warning.
- First-time onboarding clears the demo state before creating the authenticated workspace, so local sample data is never mixed with remote data.

### Milestone 3 — Collaboration and team management

**Status: Complete**

**Work**

- Add member invitations and team/user management.
- Add task assignment, task details, and relevant activity/audit information.
- Define workspace roles and enforce them in server-side mutations and UI actions.
- Improve optimistic updates and conflict/error handling for collaborative board operations.

**Exit criteria**

- Multiple users can collaborate in a workspace with role-appropriate permissions and reliable task updates.

**Implementation notes**

- Workspace profiles, invitations, owner/admin/member roles, task assignment, and task activity are persisted through Supabase.
- Invitation acceptance is handled by the `accept_workspace_invitation` database function.
- RLS restricts invitations to owners/admins, protects owners from demotion, and allows task assignment only to members of the same workspace.
- Task updates use `updated_at` optimistic concurrency checks and roll back local optimistic changes when remote mutations fail.
- A disposable two-user local Supabase smoke test verified workspace creation, invitation visibility, invitation acceptance, member count, valid assignment, blocked member invitations, and blocked cross-workspace assignment.

**Review checkpoint**

- Review collaboration semantics, permissions, and concurrency behavior.

### Milestone 4 — Production readiness and product quality

**Work**

- Add validation, accessibility checks, responsive behavior checks, and focused unit/integration tests.
- Add explicit, observability-friendly error handling.
- Add safe environment configuration.
- Document deployment, database migrations, seed/reset workflows, and operational constraints.

**Exit criteria**

- The core application passes the agreed checks and can be deployed without development-only behavior.

**Review checkpoint**

- Confirm production-readiness prerequisites before adding billing, email, and AI integrations.

### Milestone 5 — Billing and transactional email

**Work**

- Integrate Stripe subscriptions for Lite and Pro plans.
- Model subscription state and enforce plan capabilities on the server.
- Integrate Resend for welcome and invitation emails.
- Add billing/account settings.
- Process webhooks with idempotency and explicit failure handling.

**Exit criteria**

- Subscription state is synchronized safely, gated features behave consistently, and onboarding emails are observable.

### Milestone 6 — Focused AI feature

**Work**

- Select a concrete AI workflow instead of adding an unbounded assistant.
- Integrate the AI SDK behind a server-side boundary.
- Add authorization, rate limits, usage tracking, and error handling.
- Implement one narrow, testable AI capability in the task workflow.

**Exit criteria**

- The first AI feature has a documented input/output contract, safe failure behavior, and measurable user value.

**Review checkpoint**

- Review the AI use case, privacy boundaries, cost controls, and success criteria before implementation.

## Dependency order

1. Milestone 0 must be completed before Milestone 1.
2. Milestone 1 must be completed before Milestone 2.
3. Milestone 2 must be completed before Milestone 3.
4. Milestone 3 should be completed before Milestone 4.
5. Milestone 4 must be completed before Milestones 5 and 6.

## Implementation rules

- Keep domain access behind typed server-side boundaries so local persistence can be replaced by Supabase without rewriting the UI.
- Do not add Stripe, Resend, or AI complexity before the core board workflow and authorization model are stable.
- Treat external integrations as failure-prone; surface errors explicitly and avoid silent fallbacks.
- Preserve the generated Next.js agent rules.
- Read the relevant documentation under `node_modules/next/dist/docs/` before writing Next.js implementation code.
- Keep this file synchronized as milestones are started, reviewed, and completed.
