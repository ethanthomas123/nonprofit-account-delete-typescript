import assert from "node:assert/strict";
import { deleteNonprofitAccount, InfraiClient } from "../src/account_delete.ts";

const calls: Array<{ path: string; method: string }> = [];
const fetcher = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname;
  calls.push({ path, method: init?.method ?? "" });
  const data = path.includes("list_for_user") ? { items: [{ id: "session-1" }, { id: "session-2" }] } : {};
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
};

const result = await deleteNonprofitAccount({
  userId: "donor-42", keyId: "key-9", donorReceipts: [{ receiptId: "r1", amount: 25 }],
  volunteerReminders: [{ reminderId: "v1", dueAt: "2026-10-01" }], campaignReport: { campaignId: "spring", total: 100 }
}, new InfraiClient("from-test-env", fetcher));

assert.deepEqual(result.revokedSessionIds, ["session-1", "session-2"]);
assert.equal(calls.filter((call) => call.method === "POST").length, 2);
assert.deepEqual(calls.at(-1), { path: "/v1/account/keys/revoke/key-9", method: "DELETE" });
console.log("account deletion decision test passed");
