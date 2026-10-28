# BidWave on Render Free + Supabase Free

This deployment uses PostgreSQL for records and a private Supabase Storage bucket for files. It does not require a Render disk. Stay within the providers' free quotas; Render can sleep when idle and Supabase can pause inactive projects. Bidding deadlines remain absolute: overdue results are finalized when the server starts or an account reads orders/notifications.

## 1. Supabase setup

In your existing Supabase project:

1. Open **Connect → Session pooler**. Copy the PostgreSQL URI (port 5432), replacing the password placeholder with your database password. Percent-encode special characters in the password. Keep this URI private.
2. Open **Storage → New bucket**. Name it `bidwave-private`, leave **Public bucket OFF**, and allow files up to 5 MB. Leave MIME restrictions unset: the backend validates file types and stores objects as application/octet-stream.
3. Open **Project settings → API Keys**. Copy a backend **secret key** (`sb_secret_...`); the legacy `service_role` key is also supported. Never use the publishable/anon key for this backend storage connection.

You do not need to enable Supabase Auth or add public storage policies. BidWave retains its account/password/session system. Its application tables live in a separate `bidwave` schema, accessed only by the backend database connection. Startup creates missing tables and categories automatically.

## 2. Render web service

Connect `Fariss14/BidWave`, branch `main`, Node runtime, blank root directory:

- Instance: **Free**
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- No persistent disk

Set these variables in Render's Environment settings, never in GitHub:

| Name | Value |
| --- | --- |
| NODE_VERSION | 24.22.1 |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| DATABASE_URL | Your private session-pooler PostgreSQL URI |
| SUPABASE_URL | Your project's https://...supabase.co URL |
| SUPABASE_SECRET_KEY | Backend secret key, kept private |
| SUPABASE_STORAGE_BUCKET | bidwave-private |
| APP_ORIGIN | Exact assigned Render HTTPS URL, without a trailing slash |

Render supplies PORT. Do not set DATABASE_PATH for this deployment. Save and deploy. If the assigned service URL isn't known until creation, set APP_ORIGIN to the actual URL and redeploy before testing accounts.

TLS certificates are verified. If the database reports a certificate-chain error, obtain the Supabase project's database CA certificate and set DATABASE_CA_CERT to its PEM content (literal newlines or escaped `\n` are accepted). Do not disable certificate verification.

## 3. Verify

- `/api/health` responds successfully; logs show the server listening.
- Guest browsing has nine practice samples; no account required.
- Sign up two test accounts, publish an auction with an uploaded image, and bid.
- Exercise payment proof, seller review, shipment and receipt confirmation.
- A receipt or QR belonging to another account stays inaccessible.
- Redeploy and verify accounts, listings, and uploaded files survive.

This starts a fresh hosted database. Local SQLite accounts/files are not copied automatically. Keep any old SQLite database private until a separate import is prepared. PostgreSQL integration tests can run without cloud credentials using `npm test`.

## Troubleshooting

- **Database connection failure:** use the session pooler URI on port 5432, correct password, active project, and verified TLS.
- **Storage 400/403/404:** check the project URL, backend secret key, bucket name and private bucket configuration.
- **Request origin not allowed:** APP_ORIGIN must exactly match the HTTPS address in the browser.
- **Free server waking up:** allow time for Render to restart; never move the database back to its temporary local filesystem.
