import { NextResponse } from "next/server";
import { db, getSettings } from "@/lib/db";
import { invoiceNumber, PAYMENT_METHOD_LABEL } from "@/lib/documents";
import { emailReceipt, notifyOwnerText } from "@/lib/notifications";
import { mapSquareStatus, refreshInvoicePaid } from "@/lib/payments";
import { verifySquareWebhook, type SquarePayment } from "@/lib/square";

export const dynamic = "force-dynamic";

/**
 * Square calls this for payment.created / payment.updated. It moves pending payments
 * (bank transfers) to completed or failed and marks the invoice paid.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const url = process.env.SQUARE_WEBHOOK_URL ?? "";
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  if (!verifySquareWebhook(raw, req.headers.get("x-square-hmacsha256-signature"), url, key)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const event = JSON.parse(raw) as { type?: string; data?: { object?: { payment?: SquarePayment } } };
  const sq = event.data?.object?.payment;
  if (!event.type?.startsWith("payment.") || !sq) return NextResponse.json({ ignored: true });

  const existing = await db.payment.findUnique({ where: { squarePaymentId: sq.id }, include: { invoice: { include: { customer: true } } } });
  if (!existing) return NextResponse.json({ unknown: true }); // payInvoice records it; nothing to update yet
  const status = mapSquareStatus(sq.status);
  if (status === existing.status) return NextResponse.json({ unchanged: true });

  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: existing.id }, data: { status, receiptUrl: sq.receipt_url ?? existing.receiptUrl } });
    await refreshInvoicePaid(existing.invoiceId, tx);
  });
  if (status === "COMPLETED") {
    const s = await getSettings();
    const inv = existing.invoice;
    await Promise.all([
      emailReceipt(s, { ...inv, number: invoiceNumber(inv.id) }, existing.amountCents, PAYMENT_METHOD_LABEL[existing.method]),
      notifyOwnerText(s, `${inv.customer.name} paid ${invoiceNumber(inv.id)}`, `Payment of ${(existing.amountCents / 100).toFixed(2)} by ${PAYMENT_METHOD_LABEL[existing.method]} cleared.`, `/admin/invoices/${inv.id}`),
    ]);
  }
  return NextResponse.json({ ok: true });
}
