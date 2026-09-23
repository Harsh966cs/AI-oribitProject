# Orbit architecture

## Application boundaries

- `app/` contains App Router routes, layouts, and global styles.
- `components/` contains reusable presentation components. Shadcn-compatible primitives live in `components/ui`.
- `lib/` contains shared typed utilities and domain/data-access modules.
- `public/` contains static assets.
- `docs/` contains decisions and local operational documentation.
- `supabase/migrations/` contains ordered database migrations and row-level security policies.

The UI keeps provider calls behind typed modules in `lib/` or route handlers/server actions. The current Supabase MVP uses a typed browser client for RLS-protected reads and mutations; privileged provider keys remain server-only. This keeps the local MVP persistence boundary replaceable without exposing secrets.

## Route boundaries

The current application routes are:

- `/` — local workspace and Kanban board.
- `/login` — email/password sign-in and sign-up.
- `/auth/callback` — Supabase confirmation-code exchange.

Future route groups should follow these boundaries:

- `(marketing)` — public product pages
- `(auth)` — future grouped sign-in, sign-up, and onboarding routes
- `(app)` — authenticated workspace routes
- `api/` — explicit server-side integration boundaries

The installed Next.js 16 package contains documentation examples using `proxy.ts`. Orbit's `proxy.ts` now refreshes Supabase auth cookies when Supabase is configured; it intentionally does not protect the local-first root route until the authenticated workspace route is introduced.

## Environment policy

- Commit `.env.example` only.
- Keep local secrets in `.env.local`, which is ignored by Git.
- Only values explicitly prefixed with `NEXT_PUBLIC_` may be exposed to the browser.
- Supabase service-role, Stripe secret, Resend API, and AI provider keys must remain server-only.
- Validate required production variables at the integration boundary instead of silently falling back.
