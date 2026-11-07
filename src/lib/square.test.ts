import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifySquareWebhook } from "./square";

describe("verifySquareWebhook", () => {
  const url = "https://example.com/api/square/webhook";
  const key = "test-key";
  const body = '{"type":"payment.updated"}';
  const good = createHmac("sha256", key).update(url + body).digest("base64");

  it("accepts a valid signature", () => {
    expect(verifySquareWebhook(body, good, url, key)).toBe(true);
  });
  it("rejects a tampered body, wrong url, or missing signature", () => {
    expect(verifySquareWebhook(body + " ", good, url, key)).toBe(false);
    expect(verifySquareWebhook(body, good, url + "x", key)).toBe(false);
    expect(verifySquareWebhook(body, null, url, key)).toBe(false);
  });
});
