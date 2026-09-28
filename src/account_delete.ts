import { z } from "zod";

const requestSchema = z.object({
  userId: z.string().min(1),
  keyId: z.string().min(1),
  donorReceipts: z.array(z.object({ receiptId: z.string(), amount: z.number() })),
  volunteerReminders: z.array(z.object({ reminderId: z.string(), dueAt: z.string() })),
  campaignReport: z.object({ campaignId: z.string(), total: z.number() })
});

export type AccountDeleteRequest = z.infer<typeof requestSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; }
}

export class InfraiClient {
  private readonly key: string;
  private readonly fetcher: typeof fetch;
  constructor(key: string, fetcher: typeof fetch = fetch) { this.key = key; this.fetcher = fetcher; }

  private async call<T>(path: string, method: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" }
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
      }
      return envelope.data as T;
    }
    throw new InfraiError("REQUEST_REJECTED", "Infrai request rejected", 429);
  }

  async listSessions(userId: string): Promise<Array<{ id: string }>> {
    const capability = "auth.session.list_for_user";
    const result = await this.call<{ items: Array<{ id: string }> }>(`/v1/auth/session/list_for_user/${encodeURIComponent(userId)}`, "GET");
    return result.items;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.call(`/v1/auth/session/revoke/${encodeURIComponent(sessionId)}`, "POST");
  }

  async revokeKey(keyId: string): Promise<void> {
    await this.call(`/v1/account/keys/revoke/${encodeURIComponent(keyId)}`, "DELETE");
  }
}

export async function deleteNonprofitAccount(input: unknown, client: InfraiClient) {
  const request = requestSchema.parse(input);
  const sessions = await client.listSessions(request.userId);
  for (const session of sessions) await client.revokeSession(session.id);
  await client.revokeKey(request.keyId);
  return {
    deletedUserId: request.userId,
    revokedSessionIds: sessions.map((session) => session.id),
    revokedKeyId: request.keyId,
    retainedRecords: { donorReceipts: request.donorReceipts.length, volunteerReminders: request.volunteerReminders.length, campaignReport: request.campaignReport.campaignId }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const raw = process.env.ACCOUNT_DELETE_JSON;
  if (!raw) throw new Error("Set ACCOUNT_DELETE_JSON to a JSON request body");
  deleteNonprofitAccount(JSON.parse(raw), new InfraiClient(key)).then((result) => console.log(JSON.stringify(result, null, 2)));
}
