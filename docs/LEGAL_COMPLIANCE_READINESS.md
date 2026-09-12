# SAVI Legal and Compliance Readiness

Internal product-readiness record for the Phase 6C legal surfaces. This is not legal advice and does not certify compliance.

## Product facts reviewed

- Authentication uses Google OAuth, then a SAVI-signed HTTP-only session cookie. OAuth state and return-path cookies are short-lived. Google access tokens are not persisted by the application.
- User identity, account, credit, generation-job, usage, asset metadata, subscription, purchase, payment-event, and credit-grant records live in the server-side Data Connect / Cloud SQL model.
- Generated assets are stored in a private Firebase Storage bucket and served through an authenticated, owner-scoped route.
- Prompts, reference content, images, video, voice inputs, and PDFs are processed by the relevant tool. AI operations may send the requested content to Google Gemini. Uploaded files are not exposed through a public asset URL by the application.
- Browser local storage currently contains chat history, saved outputs, media-library references, and UI preferences. Session storage is used for short-lived request coordination.
- Operational logging is structured and intentionally excludes prompts, raw files, cookies, tokens, provider keys, and raw IP addresses. Firestore is used for server-side rate-limit records only.
- Stripe webhook handling is idempotent for payment events and credit grants. Refund/dispute events update purchase status and do not blindly subtract credits or force a negative account balance.
- There is no universal retention schedule or automatic erasure job, and no analytics/marketing stack. An authenticated deletion-request endpoint and Settings control record requests, while the additive erasure processor remains explicitly opt-in with no public execution route. Versioned Terms/Privacy acknowledgement records are written for authenticated sessions.
- Deletion processing is designed to freeze new mutations, preserve financial/audit records, delete private generated assets, and anonymize eligible profile fields. It does not delete Stripe, Gemini, Google, or provider-backup data, and it must remain disabled until retention and financial dependency policies are approved.

## Configuration required before launch

Set these server-side values without committing private details:

- `SAVI_LEGAL_OPERATOR_NAME`
- `SAVI_LEGAL_CONTACT_EMAIL`
- `SAVI_LEGAL_BUSINESS_ADDRESS`
- `SAVI_LEGAL_GOVERNING_LAW`
- `SAVI_LEGAL_EFFECTIVE_DATE`

The legal pages display a visible placeholder warning until these values are complete.

## Product/legal decisions required

1. Approve retention periods for account records, generated assets, usage/credit records, rate-limit records, operational logs, backups, and provider-held content.
2. Define the account access, correction, export, deletion, objection, and restriction workflow, including identity verification and backup/provider handling.
3. Confirm the minimum-age position and child-data process.
4. Finalize refund eligibility, statutory cancellation wording, request windows, and the treatment of credits after a refund or dispute.
5. Confirm the legal scope and wording of the versioned sign-in acknowledgement, and add any separate subscription/refund acknowledgement required for paid checkout.
6. Verify Google, Gemini, Firebase/Google Cloud, Firestore, Cloud SQL/Data Connect, and Stripe processing terms, subprocessor disclosures, regions, and UK/international-transfer safeguards.
7. Obtain professional review of UK GDPR transparency, PECR, consumer subscription/digital-content terms, liability wording, governing law, and AI-related disclosures.

## UK readiness observations

- The current cookie set is limited to authentication and OAuth security cookies, and no analytics consent banner is added. The persistent 30-day session cookie still needs a final PECR necessity classification; any non-essential tracking requires an appropriate consent mechanism.
- Subscription pages disclose recurring credits, the rollover cap, cancellation-at-period-end behavior, and non-expiring top-ups. Final pricing, renewal, statutory cancellation, and refund language must be approved before paid launch.
- The Privacy Policy explains the current provider and storage flows but does not claim a fixed retention period, certification, or absolute security.
- The Terms and AI notice distinguish user responsibility from provider processing and do not promise accuracy, uniqueness, professional advice, or ownership outcomes that the implementation cannot guarantee.
