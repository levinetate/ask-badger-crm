import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { issueToken, passwordMatches } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

/** POST { password } -> { token, expiresAt, businessName }. Same password as the admin login. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password : "";
  if (!passwordMatches(given)) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "That password didn't work." }, { status: 401 });
  }
  const settings = await getSettings();
  return NextResponse.json({ ...(await issueToken()), businessName: settings.businessName });
}
