# Local Supabase

Orbit uses Supabase locally through Docker. The native Supabase CLI is installed separately from the application dependencies.

## Start and reset

From the Orbit project directory:

```powershell
supabase start
supabase db reset
```

The migration in `supabase/migrations/20260922123000_initial_orbit.sql` creates workspaces, memberships, boards, columns, tasks, indexes, and row-level security policies. `supabase db reset` applies the migration and `supabase/seed.sql`.

Local service URLs:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

Copy `.env.example` to `.env.local` and set the local API URL and publishable key printed by `supabase start`. Do not put the secret key in browser code or a `NEXT_PUBLIC_*` variable.

## Authentication

The `/login` route supports email/password sign-in and sign-up. Supabase email confirmation redirects through `/auth/callback`, which exchanges the authorization code for a session. `proxy.ts` refreshes Supabase auth cookies when both public Supabase variables are configured.

Signed-out users use the local-first MVP. Authenticated users load and mutate their workspace through the typed remote adapter in `lib/supabase/orbit-data.ts`.

## Reset

`supabase db reset` deletes and recreates the local database. It is safe for development data only. The seed file creates no user-owned records because user IDs must come from Supabase Auth; the first authenticated user creates a workspace through the onboarding flow.
