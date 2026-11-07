"use server";

import { z } from "zod";
import { db, getSettings } from "@/lib/db";
import { amountDueCents, invoiceNumber, PAYMENT_METHOD_LABEL } from "@/lib/documents";
import { emailReceipt, notifyOwnerText } from "@/lib/notifications";
import { addPayment, mapSquareStatus } from "@/lib/payments";
import { createSquarePayment, methodFromSource, squareConfigured, SquareError } from "@/lib/square";

const schema = z.object({
  token: z.string().min(10).max(100),
  sourceId: z.string().min(5).max(500),
  verificationToken: z.string().max(2000).optional(),
  wallet: z.enum(["CARD", "APPLE_PAY", "GOOGLE_PAY", "CASH_APP", "ACH"]),
  idempotencyKey: z.string().uuid(),
});

export type PayResult = { ok: true; status: "COMPLETED" | "PENDING" } | { ok: false; error: string };

const FRIENDLY: Record<string, string> = {
  CARD_DECLINED: "Your card was declined. Please try another card.",
  CVV_FAILURE: "The security code didn't match. Please check it and try again.",
  ADDRESS_VERIFICATION_FAILURE: "The ZIP code didn't match your card.",
  INVALID_EXPIRATION: "The expiration date is invalid.",
  INSUFFICIENT_FUNDS: "The card was declined for insufficient funds.",
  GENERIC_DECLINE: "The payment was declined. Please try another method.",
};

export async function payInvoice(input: z.input<typeof schema>): Promise<PayResult> {
  const d = schema.parse(input);
  if (!squareConfigured()) return { ok: false, error: "Online payments aren't set up yet." };
  const inv = await db.invoice.findUnique({ where: { token: d.token }, include: { customer: true, payments: true } });
  if (!inv || inv.status !== "SENT") return { ok: false, error: "This invoice can't be paid online right now." };
  if (inv.payments.some((p) => p.status === "PENDING")) return { ok: false, error: "A payment is already processing for this invoice." };
  const due = amountDueCents(inv);
  if (due <= 0) return { ok: false, error: "This invoice is already paid." };

  try {
    const payment = await createSquarePayment({
      sourceId: d.sourceId,
      verificationToken: d.verificationToken,
      amountCents: due,
      idempotencyKey: d.idempotencyKey,
      referenceId: invoiceNumber(inv.id),
      note: `Invoice ${invoiceNumber(inv.id)}${inv.title ? `: ${inv.title}` : ""}`,
      buyerEmail: inv.customer.email,
    });
    const status = mapSquareStatus(payment.status);
    if (status === "FAILED") return { ok: false, error: "The payment didn't go through. Please try another method." };
    const wallet = d.wallet === "APPLE_PAY" || d.wallet === "GOOGLE_PAY" ? d.wallet : undefined;
    const method = d.wallet === "ACH" ? "SQUARE_ACH" : d.wallet === "CASH_APP" ? "SQUARE_CASH_APP" : methodFromSource(payment.source_type, wallet);
    // The webhook may have recorded it first; the unique Square id keeps it to one row.
    const existing = await db.payment.findUnique({ where: { squarePaymentId: payment.id } });
    if (!existing) {
      await addPayment({ invoiceId: inv.id, method, status, amountCents: payment.amount_money.amount, squarePaymentId: payment.id, receiptUrl: payment.receipt_url ?? "" });
    }
    if (status === "COMPLETED" && !existing) {
      const s = await getSettings();
      await Promise.all([
        emailReceipt(s, { ...inv, number: invoiceNumber(inv.id) }, payment.amount_money.amount, PAYMENT_METHOD_LABEL[method]),
        notifyOwnerText(s, `${inv.customer.name} paid ${invoiceNumber(inv.id)}`, `${inv.customer.name} paid ${(payment.amount_money.amount / 100).toFixed(2)} by ${PAYMENT_METHOD_LABEL[method]}.`, `/admin/invoices/${inv.id}`),
      ]);
    }
    return { ok: true, status: status === "COMPLETED" ? "COMPLETED" : "PENDING" };
  } catch (e) {
    if (e instanceof SquareError) {
      console.error("[square] payment error", e.code, e.message);
      return { ok: false, error: FRIENDLY[e.code] ?? "The payment didn't go through. Please try again or use another method." };
    }
    console.error("[square] payment error", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
