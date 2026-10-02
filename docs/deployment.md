# Orbit deployment notes

Milestone 5 uses Stripe test mode and Resend from server-only route handlers.
Configure the following values in the deployment environment:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_PRO_PRICE_ID
STRIPE_WEBHOOK_SECRET
```

Resend is optional. If `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are not set,
Orbit creates invitations normally and shows a message that email delivery is
disabled. This is appropriate when invitations are shared manually.

The Docker Supabase instance used by WSL is local-only. Vercel cannot connect
to `127.0.0.1`, Docker service names, or a private WSL network. A deployed
workspace requires a hosted Supabase project with its URL and keys configured
above; otherwise use the app locally with Docker Supabase.

Apply the ordered Supabase migrations before starting the application. The
billing migrations create a Lite subscription row for each workspace, enforce
the Lite member and board limits in the database, and keep failed webhook
events retryable. Do not skip the reliability migration after deploying the
original billing migration.

Create a Stripe test-mode webhook endpoint at:

```text
https://<your-domain>/api/stripe/webhook
```

Subscribe it to checkout completion and subscription lifecycle events. The
endpoint rejects missing or invalid signatures and records each Stripe event
ID before applying updates, so Stripe retries are safe.

Use a verified sending domain or Resend's development sender only when email
delivery is enabled. Provider failures are returned as explicit errors; they
are not converted into successful-looking email states.
