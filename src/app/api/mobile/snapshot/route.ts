import { NextResponse } from "next/server";
import { isMobileAuthorized, issueToken, unauthorized } from "@/lib/mobileAuth";
import { buildSnapshot } from "@/lib/mobileSync";

export const dynamic = "force-dynamic";

/** GET -> everything the iPhone app shows, plus a refreshed token. */
export async function GET(req: Request) {
  if (!(await isMobileAuthorized(req))) return unauthorized();
  const snapshot = await buildSnapshot();
  return NextResponse.json({ ...snapshot, ...(await issueToken()) });
}
