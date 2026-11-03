# A Guide to Plain REST Auth API Session Revocation in Node.js

Require a demonstrable way to revoke every session before choosing an email signup and login API for a healthtech application.

The deciding constraint is what happens to existing access when a patient deletes an account. A convenient login flow tells you little about that boundary.

TL;DR: Evaluate plain REST authentication through a deletion rehearsal: create two sessions, delete the account, and verify that both lose access. Require fresh authentication for the sensitive action, make revocation observable, and distinguish blocked access from completed data erasure. Compare the friction of those controls before treating price as the deciding factor.

This is an observability exercise with a security consequence. A successful deletion response is useful evidence only if you can connect it to the access checks that follow.

## From a successful response to a revoked session

Before: the application receives a successful deletion response and clears the browser cookie. The browser looks signed out. But that observation says nothing about a second browser or another credential that was already issued.

After: account deletion closes the authority that every session depends on. Subsequent protected requests fail the authorization check, including requests from that second browser. Now the visible outcome matches the intended boundary.

Diagram in words: email signup → login → session issuance → protected request → current account and session check. The deletion path enters at that current-state check. Clearing a cookie affects a client; changing the accepted server state affects the credentials presented to the application.

Follow the credential.

OWASP's Authentication Cheat Sheet calls for reauthentication before sensitive operations and discusses invalidating sessions and rotating tokens after reauthentication. It also points readers to session management guidance. Use that distinction to ask a precise engineering question: does the proposed deletion flow actually invalidate existing access, or does it merely stop the user from signing in again? For a GDPR account-deletion workflow, session revocation is one security step. It is not evidence that every copy of personal data has been erased.

## What should a plain REST auth alternative prove?

Start with observable behavior. Can an email account sign up and log in? Can the application reject an invalid credential without revealing whether the email address exists? Can a sensitive operation require reauthentication? Then test what happens to every credential after deletion. These are acceptance criteria for the application, not a ranking of authentication products.

OWASP recommends generic authentication error responses to reduce account enumeration and describes throttling as protection against automated attacks. Those requirements belong in the comparison alongside session control. A clean request format does not remove the need to decide how errors, retries, and authentication state behave.

For this example, the application chooses immediate rejection on the next protected request after deletion commits. That is a proposed contract, not a universal promise of REST or of a token format. Write it down before evaluating implementations. A token that can be checked without consulting current account state needs another mechanism if the application expects an account change to affect its acceptance immediately. Waiting for expiry is a different contract.

The limitation of checking shared state on every protected request is an added operational dependency. This approach is not suitable for a service that must authorize requests while disconnected from that state unless it defines another trustworthy revocation mechanism. The tradeoff is explicit: accepting credentials until they expire reduces those checks, but permits an interval of continued access unless another revocation control intervenes. Compare that interval with the healthtech application's security requirement.

Don't hide continued access behind the word “logout.”

## A small example that makes the boundary visible

Here is a copyable TypeScript model for Node.js. It deliberately starts after email signup, password verification, and reauthentication. The strings are synthetic session handles for a local exercise; they are not production tokens. The model demonstrates the acceptance rule and the two-session deletion rehearsal.

```ts
type Session = { accountId: string };

const accounts = new Set<string>([
  "demo-patient-account",
]);
const sessions = new Map<string, Session>([
  ["demo-browser-one", { accountId: "demo-patient-account" }],
  ["demo-browser-two", { accountId: "demo-patient-account" }],
]);

function authorize(handle: string): string | null {
  const session = sessions.get(handle);
  if (!session || !accounts.has(session.accountId)) return null;
  return session.accountId;
}

function deleteAccount(accountId: string): number {
  // This synchronous model cannot interleave with another call.
  accounts.delete(accountId);
  let revoked = 0;
  for (const [handle, session] of sessions) {
    if (session.accountId !== accountId) continue;
    sessions.delete(handle);
    revoked += 1;
  }
  return revoked;
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

expect(authorize("demo-browser-one") !== null, "First session works");
expect(authorize("demo-browser-two") !== null, "Second session works");
const revoked = deleteAccount("demo-patient-account");
expect(revoked === 2, "Both stored sessions were revoked");
expect(authorize("demo-browser-one") === null, "First session denied");
expect(authorize("demo-browser-two") === null, "Second session denied");
expect(deleteAccount("demo-patient-account") === 0, "Retry is harmless");
```

The useful part is the check against current account state. Deleting session records also removes the model's stored credentials, but account absence independently blocks access. The final assertion makes repeated deletion harmless within this model. It does not implement a network retry protocol. Keep the scope honest: these maps exist in one process, disappear on restart, and provide no persistence across application instances. A deployed implementation needs shared authoritative state and a concurrency contract. Require session issuance and account deletion to serialize around the same account state, so a concurrent login cannot issue a usable session after deletion commits. Require every protected request path to apply the acceptance rule. A route that skips the check defeats the design.

Deletion cannot undo a completed write.

For sensitive writes, decide how authorization and the write are ordered against deletion, then test that ordering with the chosen datastore. That decision belongs in the implementation contract, not in an optimistic comment beside the delete handler.

## Make the rehearsal observable before deployment

Give access revocation and data erasure separate completion signals in the proposed workflow. One says the application has stopped accepting the account's sessions. The other says the erasure work covered by the application's deletion policy has finished. Avoid a single success counter that blurs those meanings.

For a synthetic rehearsal, record a deletion attempt, its revocation outcome, the number of session records removed, and the elapsed time to that outcome. Then issue protected requests using both synthetic sessions and record their allow or deny decisions. The expected count in this example is 2. A count alone cannot prove enforcement; the subsequent denied requests are the behavioral evidence.

Use bounded metric labels such as operation and outcome. Keep email addresses, patient details, passwords, and raw session handles out of this proposed telemetry. If the rehearsal needs correlation, use a test-run identifier in controlled test records rather than placing individual accounts into metric labels. The goal is to explain a failed assertion without turning an authentication dashboard into a patient directory.

Deployment changes the test.

Repeat the rehearsal across application instances and exercise a login racing with deletion. If current account state cannot be read, the proposed security contract should deny protected access and expose the dependency failure to operators. That choice can reduce availability; it preserves the acceptance rule during uncertainty. Give the response a distinct internal reason so an operator can distinguish revoked access from an unavailable state check without exposing account details in the public response.

This also sharpens the selection conversation. Ask how the team will observe revocation, how it will reproduce a failed deletion rehearsal, and which component owns the current-state decision. Operational effort includes those checks, deployment coordination, and incident diagnosis. A nominal authentication price does not answer those questions.

## Will this add friction or make deletion feel slow?

Reauthentication adds a deliberate interruption at a sensitive boundary.

OWASP recommends reauthentication for sensitive features and risk events; use that guidance to define the deletion confirmation step. Avoid repeatedly challenging ordinary navigation just because a deletion flow exists. The useful comparison is whether a design puts the interruption where the risk justifies it and gives users a clear next step when confirmation fails.

A second objection is that complete data erasure may take longer than a request. Separate that workflow from the decision to accept another session request. The application can model access as revoked while erasure remains pending, with truthful status for each stage. Define retry behavior and ownership for the remaining work. Do not label the entire deletion complete merely because authentication access has stopped.

For a healthtech account-deletion workflow, choose the acceptance contract first: sensitive-action confirmation, rejection of both existing sessions, explicit handling of concurrent issuance, and evidence that operators can inspect. Then assess the email signup and login integration against it. The best result of this exercise is a reproducible boundary that the team can explain and maintain.

## References

- OWASP Authentication Cheat Sheet — reauthentication, authentication responses, throttling, and session handling guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
