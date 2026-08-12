# Connecto FBPI Control

Private React/Vite dashboard for the Noon FBPI test account. The interface is built from task-specific forms, tables, dialogs, and guided workflows; operators never need to edit raw JSON.

Core operations include:

- Order notifications, order detail, AWB allocation, and individual or bulk shipment creation.
- A category-aware product wizard with selectable Noon attributes, variants, media, content/QC, and barcode mapping.
- Warehouse stock and country pricing in one inventory workspace.
- Return-reference lookup and configurable report exports.

## Frontend integration contract

See [New Noon + FBPI frontend integration](docs/new-noon-fbpi-frontend-integration.md) for the production multi-user API contract, request/response examples, fallback behavior, and per-user data-isolation requirements.

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

## Standalone test-dashboard authentication

The password screen creates a short-lived backend session token, which is kept in `sessionStorage` and sent as a bearer token. Configure `NOON_DASHBOARD_PASSWORD` and `NOON_DASHBOARD_USER_ID` only in the backend environment; never expose Noon credentials, JWT secrets, or access tokens through `VITE_*` variables.

The production multi-user frontend must use the main Connecto login token instead. See the integration contract above.
