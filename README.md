# SAVI by SKH.GLOBAL

SAVI is a private AI workspace for image, video, voice, PDF, and assistant workflows. Paid tools execute only through trusted server routes using the signed SAVI Google session.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production foundations

- Custom Google OAuth and signed SAVI sessions; Firebase Auth is not used.
- Authoritative credit balances, reservations, final charges, releases, and idempotent jobs live in Firebase Data Connect.
- Generated assets are stored at private, user-scoped Firebase Storage paths and served only through an owner-checked SAVI route.
- Provider keys stay on the server. Browser clients never call providers or Data Connect directly.
- Ask SAVI chat is free under server-side fair-use limits. Paid tools show only their SAVI credit quote before confirmation.
- `SAVI_DEV_CREDIT_GRANT_ENABLED` is `false` by default. Do not enable it outside controlled local development.

Copy `.env.example` to `.env.local` and add only server-side credentials. Never commit real secrets.

## Pages

- `/` Ask SAVI landing workspace
- `/workspace` Ask SAVI and focused tool workspaces
- `/credits` authoritative account balance
- `/settings` account and generation information

## Validation before deployment

```bash
npx tsc --noEmit
npm run build
firebase dataconnect:compile --project savi-257e0
```

The Data Connect compile validates the schema and connector only. It does not deploy.
