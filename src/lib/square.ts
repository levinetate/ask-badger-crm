import { createHmac, timingSafeEqual } from "crypto";

// Square REST calls with fetch, so there's no SDK version to keep in step.
// Docs: https://developer.squareup.com/reference/square/payments-api/create-payment

const SQUARE_VERSION = "2024-10-17";

export function squareEnv() {
  const production = process.env.SQUARE_ENVIRONMENT === "production";
  return {
    production,
    apiBase: production ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com",
    sdkUrl: production ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js",
    applicationId: process.env.SQUARE_APPLICATION_ID ?? "",
    locationId: process.env.SQUARE_LOCATION_ID ?? "",
    accessToken: process.env.SQUARE_ACCESS_TOKEN ?? "",
  };
}

export function squareConfigured(): boolean {
  const e = squareEnv();
  return Boolean(e.applicationId && e.locationId && e.accessToken);
}

export type SquarePayment = {
  id: string;
  status: "APPROVED" | "PENDING" | "COMPLETED" | "CANCELED" | "FAILED";
  amount_money: { amount: number; currency: string };
  reference_id?: string;
  receipt_url?: string;
  source_type?: string;
};

async function squareFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const e = squareEnv();
  const res = await fetch(`${e.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${e.accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { errors?: { code: string; detail?: string }[] };
  if (!res.ok || body.errors?.length) {
    const err = body.errors?.[0];
    throw new SquareError(err?.code ?? `HTTP_${res.status}`, err?.detail ?? "Square request failed");
  }
  return body;
}

export class SquareError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Charges a tokenized card / wallet / bank source. */
export async function createSquarePayment(input: {
  sourceId: string;
  verificationToken?: string;
  amountCents: number;
  idempotencyKey: string;
  referenceId: string;
  note: string;
  buyerEmail?: string;
}): Promise<SquarePayment> {
  const { payment } = await squareFetch<{ payment: SquarePayment }>("/v2/payments", {
    method: "POST",
    body: JSON.stringify({
      source_id: input.sourceId,
      verification_token: input.verificationToken,
      idempotency_key: input.idempotencyKey,
      amount_money: { amount: input.amountCents, currency: "USD" },
      location_id: squareEnv().locationId,
      reference_id: input.referenceId,
      note: input.note.slice(0, 500),
      buyer_email_address: input.buyerEmail,
      autocomplete: true,
    }),
  });
  return payment;
}

export async function getSquarePayment(id: string): Promise<SquarePayment> {
  const { payment } = await squareFetch<{ payment: SquarePayment }>(`/v2/payments/${encodeURIComponent(id)}`);
  return payment;
}

/**
 * Checks Square's webhook signature: base64 HMAC-SHA256 of (notification URL + raw body)
 * using the subscription's signature key. https://developer.squareup.com/docs/webhooks/step3validate
 */
export function verifySquareWebhook(rawBody: string, signature: string | null, url: string, key: string): boolean {
  if (!signature || !key) return false;
  const expected = createHmac("sha256", key).update(url + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function methodFromSource(sourceType: string | undefined, walletHint?: string) {
  if (walletHint === "APPLE_PAY") return "SQUARE_APPLE_PAY" as const;
  if (walletHint === "GOOGLE_PAY") return "SQUARE_GOOGLE_PAY" as const;
  switch (sourceType) {
    case "BANK_ACCOUNT": return "SQUARE_ACH" as const;
    case "WALLET": return "SQUARE_CASH_APP" as const;
    default: return "SQUARE_CARD" as const;
  }
}
