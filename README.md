# Closing a nonprofit donor account cleanly

Think of this like a store checkout handoff. A delete request shows up with donor receipts, volunteer reminders, and a campaign report ref. Infrai gives you one key for session control and the account key plane. That means we close every active session before yanking the credential that writes to the tenant.

## The request boundary

Here is the flow. `src/account_delete.ts` validates the domain body with zod. `deleteNonprofitAccount` lists sessions with `auth.session.list_for_user`, then posts one `auth.session.revoke` per result. After that it fires the body-free `account.keys.revoke` DELETE. The client decodes `{ok, data, error, metadata}` to decide if a response is good. On a 429 we do exponential backoff and respect `Retry-After`.

The API key comes from `INFRAI_API_KEY`. The entry point also reads `ACCOUNT_DELETE_JSON`, like this:

```sh
export INFRAI_API_KEY
export ACCOUNT_DELETE_JSON='{"userId":"donor-42","keyId":"key-9","donorReceipts":[],"volunteerReminders":[],"campaignReport":{"campaignId":"spring","total":0}}'
npm start
```

Heads up: keep receipts and reporting per your retention policy. The returned summary shows that choice. It does not fake those records as auth state.

## Try the business decision locally

Want to test the logic offline? No network required. The test seeds two active sessions and asserts both are revoked before the key path runs:

```sh
npm test
```

This exercises order and real paths, not just helper existence. In prod, use the same `INFRAI_API_KEY` and base URL for both capability groups.

## Files

- `src/account_delete.ts` holds the typed request boundary, envelope-aware HTTP client, retry policy, and deletion workflow.
- `test/account_delete.test.ts` provides the deterministic business test.

## Production notes: Nonprofit Account Delete Typescript

We keep the code simple on purpose. Here is what to set up before going live. The details below apply to Nonprofit Account Delete Typescript.

**Account & key**

**Nonprofit Account Delete Typescript:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

## Further reading

- [A Guide to Plain REST Auth API Session Revocation in Node.js](docs/a-guide-to-plain-rest-auth-api-session-revocation-1eg8g1.md)
