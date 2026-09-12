# SAVI Production Deployment Checklist

Internal operational checklist. Do not add secrets or customer data here.

## Phase 6F.4A Production Guardrails

- Keep `default`/`dev` mapped to `savi-257e0` and `prod` mapped to `savi-production-607fd`.
- Use `npm run production:preflight` before any production release work.
- Use `npm run dataconnect:compile:prod` for the explicitly production-targeted Data Connect compile. It uses `firebase.production.json` and never relies on the default Firebase project.
- The private GitHub repository `skhglobaldev-arch/Savi` is connected to App Hosting on `main`; automatic rollout may occur after a push to the live branch. Do not push to `main` without the explicit production rollout gate.

## Environment Inventory

### Required for local development

- `SAVI_AUTH_SECRET`: at least 32 random characters.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: local OAuth credentials with the local callback registered.
- `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_DATA_CONNECT_SERVICE_ID`, `FIREBASE_DATA_CONNECT_LOCATION`, and `FIREBASE_DATA_CONNECT_CONNECTOR`.
- Application Default Credentials for Firebase Admin. `GOOGLE_APPLICATION_CREDENTIALS` is optional when ambient ADC is available.
- `GEMINI_API_KEY` for provider-backed generation; Ask SAVI can use its continuity response without it.
- `SAVI_APP_ORIGIN` is optional locally; local request origin fallback is allowed.
- Stripe values are optional until controlled Stripe test configuration is intentionally enabled.

### Required for production

- `SAVI_AUTH_SECRET` with at least 32 random characters.
- `SAVI_APP_ORIGIN` as the canonical HTTPS origin, without query, hash, credentials, or localhost.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, with the production callback registered at `/api/auth/google/callback`.
- `FIREBASE_PROJECT_ID` and `FIREBASE_STORAGE_BUCKET` for private Storage and Firebase Admin.
- `FIREBASE_DATA_CONNECT_SERVICE_ID`, `FIREBASE_DATA_CONNECT_LOCATION`, and `FIREBASE_DATA_CONNECT_CONNECTOR` for the existing Data Connect / Cloud SQL deployment.
- `GEMINI_API_KEY` for full provider-backed SAVI generation.
- Ambient production ADC or a securely mounted `GOOGLE_APPLICATION_CREDENTIALS` file.
- `SAVI_TRUSTED_PROXY=true` only when the production proxy sanitizes `X-Forwarded-For` or `X-Real-IP`; otherwise leave it false.
- Stripe secret and webhook configuration only when commerce is enabled: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- Legal configuration before launch: `SAVI_LEGAL_OPERATOR_NAME`, `SAVI_LEGAL_CONTACT_EMAIL`, `SAVI_LEGAL_BUSINESS_ADDRESS`, `SAVI_LEGAL_GOVERNING_LAW`, and `SAVI_LEGAL_EFFECTIVE_DATE`.

### Optional and safe public values

- `NEXT_PUBLIC_APP_NAME` is a safe browser-visible label.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a safe public value if a future Stripe browser integration needs it; SAVI currently uses server-created top-level redirects.
- `GEMINI_TEXT_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_IMAGE_MODEL`, and `GEMINI_VIDEO_MODEL` override server-side model defaults.
- `SAVI_TEXT_TO_IMAGE_ENABLED` defaults to enabled; use it only as an intentional operational flag.
- `SAVI_COMMERCE_CATALOG_VERSION`, `SAVI_COMMERCE_PLANS_JSON`, and `SAVI_COMMERCE_TOPUPS_JSON` are approved catalog configuration values, not secrets.

### Server-only values

Keep `SAVI_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, ADC credentials, and Firebase Admin runtime configuration out of browser bundles and source control. `.env.example` contains names and safe placeholders only.

## Stage 2 Provisioning Checklist

Complete these steps only after the production project, owner, region, and budget are approved. Keep `savi-257e0` as development/validation; do not point a production alias at it.

- [ ] Create the separate production Firebase/GCP project.
- [ ] Attach the approved billing account.
- [ ] Add the production Firebase CLI alias after the real project exists: `firebase use --add <PRODUCTION_PROJECT_ID>`, then save the alias as `prod`.
- [ ] Provision the production Data Connect service and Cloud SQL database/instance in the approved region.
- [ ] Create the separate private production Storage bucket.
- [ ] Enable Firestore for the production project.
- [ ] Configure the managed runtime identity and least-privilege IAM.
- [ ] Configure the Firebase App Hosting backend for the production branch and Node.js `>=20.9.0`.
- [ ] Add production secrets through the hosting secret/configuration store.
- [ ] Configure `SAVI_APP_ORIGIN` with the canonical HTTPS origin.
- [ ] Register the production Google OAuth client and callback.
- [ ] Configure the production domain and HTTPS.
- [ ] Configure Cloud SQL backups and point-in-time recovery.
- [ ] Configure platform logs, uptime checks, and alerts.
- [ ] Run production smoke checks before enabling public traffic.
- [ ] Leave Stripe Live configuration for Phase 6F.2.
- [ ] Leave legal completion and final legal values for Phase 6F.3.

Data Connect configuration is project-specific. Once the real production service, database, instance, region, and connector values exist, update a reviewed production deployment copy of `dataconnect/dataconnect.yaml` and the matching runtime environment values. Compile and review the schema/operation diff before any deployment; do not add fake project identifiers or replace the development target prematurely.

## Architecture Checks

- Keep `savi-257e0` as the development/validation project. Confirm production uses the explicitly approved separate project.
- For development, confirm Data Connect remains `savi-257e0-service` in `europe-west2`, connector `savi`, and Cloud SQL database `savi-257e0-database` / instance `savi-257e0-instance`. For production, verify the separately provisioned target values instead.
- Keep Data Connect operations `@auth(level: NO_ACCESS)` and callable only through Firebase Admin server code.
- Keep the Firebase Storage bucket private; generated assets remain owner-checked through `/api/assets/[assetId]`.
- Keep Firestore limited to server-side `savi_rate_limits` records. It is not the credit, account, reservation, or commerce authority.
- Do not run emulators or use localhost origins in production.

## Release Gate

- Configure the production domain, HTTPS, OAuth callback, and proxy header sanitization.
- Provide required production environment values through the deployment secret/configuration store.
- Acknowledge the existing Data Connect release/compile review before any Data Connect deployment; do not deploy from this checklist.
- Verify private Storage access and owner-scoped asset retrieval.
- Configure Stripe TEST values only in the later commerce phase; never use live Stripe values during this gate.
- Run `npx tsc --noEmit`, `npm run build`, `npm audit`, and `git diff --check`.
- Run production-mode smoke tests for `/`, `/settings`, `/credits`, `/api/health`, OAuth entry, protected APIs, catalog, assets, headers, and webhook rejection.
- Record a rollback checkpoint and retain the previous known-good deployment before release.
