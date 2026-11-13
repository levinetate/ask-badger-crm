// 1x1 transparent GIF loaded by estimate and invoice emails to record the first open.
import { recordOpen } from "@/lib/openTracking";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params;
  const clean = token.replace(/\.gif$/, "");
  if ((kind === "e" || kind === "i") && clean.length >= 10 && clean.length <= 100) {
    await recordOpen(kind, clean, "email");
  }
  return new Response(new Uint8Array(GIF), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
