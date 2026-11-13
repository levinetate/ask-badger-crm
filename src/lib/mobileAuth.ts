import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createSessionValue, isValidSession } from "./session";

/** The iPhone app sends the same signed session value the admin cookie uses, as a Bearer token. */
export async function isMobileAuthorized(req: Request): Promise<boolean> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? isValidSession(m[1].trim()) : false;
}

export function unauthorized() {
  return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
}

export function passwordMatches(given: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const x = Buffer.from(given);
  const y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A fresh token, so the app stays signed in as long as it syncs at least every two weeks. */
export async function issueToken() {
  const { value, maxAge } = await createSessionValue();
  return { token: value, expiresAt: new Date(Date.now() + maxAge * 1000).toISOString() };
}
