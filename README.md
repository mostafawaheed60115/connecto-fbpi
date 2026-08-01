# Connecto FBPI Control

Private React/Vite dashboard for the Noon FBPI test account. It provides two guided flows documented in `Noon FBPI operations.docx`:

1. Upload a product, inspect content/QC, assign stock to `W00172296EG`, then verify it.
2. Assign an existing `partner_sku` to `W00172296EG`, then verify it.

## Run locally

```bash
npm ci
copy .env.example .env
npm run dev
```

## Vercel deployment

Import this directory as a GitHub repository in Vercel. Set these environment variables for Preview and Production:

```text
VITE_API_BASE_URL=https://test.connecto-me.com/service1
```

Vercel builds this project with `npm run build` and publishes `dist/`.

## Required authentication and CORS setup

The service1 APIs authenticate with the Connecto `access_token` cookie. A static Vercel deployment needs the dashboard host to be able to send that cookie to `test.connecto-me.com`.

Before using a `*.vercel.app` URL for live API calls, provide a same-site authenticated route or a secure backend-for-frontend proxy. For a Connecto custom domain, configure the service CORS allowlist for that exact dashboard origin and ensure the auth cookie is `Secure`, `SameSite=None`, and has an appropriate `.connecto-me.com` domain scope. Do not put Noon credentials, JWT secrets, or an access token in Vercel environment variables prefixed with `VITE_`.

The password screen creates a short-lived backend session. Configure `NOON_DASHBOARD_PASSWORD` and `NOON_DASHBOARD_USER_ID` only in the service1 backend environment; never expose them as `VITE_*` variables.
