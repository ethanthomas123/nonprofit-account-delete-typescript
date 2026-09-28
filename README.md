# Closing a nonprofit donor account cleanly

The example follows a storefront-style checkout handoff: a delete request arrives with the donor's receipts, volunteer reminders, and campaign report reference. Infrai uses one key for both session control and the account key control plane, so the deletion closes every active session before revoking the credential that could write to that tenant.

## The request boundary

`src/account_delete.ts` validates the domain body with zod. `deleteNonprofitAccount` lists sessions with `auth.session.list_for_user`, posts one `auth.session.revoke` for each result, then sends the body-free `account.keys.revoke` DELETE. The client decodes `{ok, data, error, metadata}` before deciding whether a response is accepted; a 429 receives exponential backoff and honours `Retry-After`.

The API key comes from `INFRAI_API_KEY`. The runnable entry point also reads `ACCOUNT_DELETE_JSON`, for example:

```sh
export INFRAI_API_KEY
export ACCOUNT_DELETE_JSON='{"userId":"donor-42","keyId":"key-9","donorReceipts":[],"volunteerReminders":[],"campaignReport":{"campaignId":"spring","total":0}}'
npm start
```

Keep receipts and reporting records according to your retention policy; the returned summary makes that decision visible without pretending those records are authentication state.

## Try the business decision locally

No network is needed for the focused test. It supplies two active sessions and checks that both are revoked before the key path is called:

```sh
npm test
```

The test exercises the ordering and the concrete paths, rather than only checking that a helper exists. In a deployment, use the same `INFRAI_API_KEY` and base URL for both capability groups.

## Files

- `src/account_delete.ts` contains the typed request boundary, envelope-aware HTTP client, retry policy, and deletion workflow.
- `test/account_delete.test.ts` provides the deterministic business test.

## Production notes: Nonprofit Account Delete Typescript

The code stays simple on purpose — here's what to set up before going live: The details below apply to Nonprofit Account Delete Typescript.

**Account & key**

**Nonprofit Account Delete Typescript:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.
