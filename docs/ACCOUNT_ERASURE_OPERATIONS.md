# SAVI Account Erasure Operations

This operator-only procedure handles an authenticated customer deletion request. It is not a public endpoint and it does not run automatically.

## Review first

Use application-default credentials with access to the intended SAVI Data Connect service. Review only by request identifier:

```sh
npm run account-deletion:review -- --request <DELETION_REQUEST_ID>
```

The default is non-destructive. Confirm the request and account states, eligibility, blockers, asset counts, and that financial records will be retained before continuing. The command reports identifiers, counts, and statuses only; it does not print customer content, provider credentials, or payment details.

Do not execute a request that reports active subscriptions, unresolved financial events, active credit reservations, active generation jobs, invalid asset paths, or `processing_already_claimed`.

## Execute deliberately

Only after review and internal authorization, configure the operator runtime with the existing explicit processor gate, then include `--execute`:

```sh
SAVI_ERASURE_PROCESSOR_ENABLED=true npm run account-deletion:review -- --request <DELETION_REQUEST_ID> --execute
```

Both the flag and the environment gate are required. There is no scheduled erasure and no browser-accessible operator route.

## Verify and recover safely

Re-run the default review command after execution. A completed request cannot be run again. A request already in `processing` is deliberately refused to prevent a concurrent second processor. If an operator has confirmed that an interrupted worker is no longer running, recover that request to `failed` through the existing atomic state operation before reviewing and retrying it:

```sh
SAVI_ERASURE_PROCESSOR_ENABLED=true npm run account-deletion:review -- --request <DELETION_REQUEST_ID> --execute --recover-processing
```

For `partially_completed` or `failed`, review the reported status and blockers before an authorized retry. Do not manually delete bucket prefixes, user rows, credit ledgers, purchases, subscriptions, payment events, or provider records.

The processor deletes only objects under the canonical `users/<userId>/assets/` prefix and records partial asset failures. It anonymizes eligible profile information and retains the deletion tombstone so a prior OAuth identity cannot silently recreate the account. Financial and audit records are preserved; retention periods and any provider-side deletion process remain separate operator/legal decisions.
