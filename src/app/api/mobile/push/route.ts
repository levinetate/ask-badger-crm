import { NextResponse } from "next/server";
import { isMobileAuthorized, unauthorized } from "@/lib/mobileAuth";
import { applyPush, pushSchema } from "@/lib/mobileSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST changes made on the iPhone -> { ids: { [clientKey]: id }, warnings: string[] }. */
export async function POST(req: Request) {
  if (!(await isMobileAuthorized(req))) return unauthorized();
  const parsed = pushSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The app sent data the website didn't understand.", detail: parsed.error.message }, { status: 400 });
  }
  const result = await applyPush(parsed.data);
  return NextResponse.json(result);
}
