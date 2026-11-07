import type { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { db } from "./db";

/** Recomputes paid amount and status from the invoice's completed payments. */
export async function refreshInvoicePaid(invoiceId: number, tx: Prisma.TransactionClient = db) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  const paid = inv.payments.filter((p) => p.status === "COMPLETED").reduce((a, p) => a + p.amountCents, 0);
  const fullyPaid = inv.totalCents > 0 && paid >= inv.totalCents;
  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaidCents: paid,
      ...(inv.status === "VOID" ? {} : fullyPaid ? { status: "PAID", paidAt: inv.paidAt ?? new Date() } : inv.status === "PAID" ? { status: "SENT", paidAt: null } : {}),
    },
  });
}

export async function addPayment(input: {
  invoiceId: number;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  squarePaymentId?: string;
  receiptUrl?: string;
  note?: string;
}) {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId: input.invoiceId,
        method: input.method,
        status: input.status,
        amountCents: input.amountCents,
        squarePaymentId: input.squarePaymentId ?? null,
        receiptUrl: input.receiptUrl ?? "",
        note: input.note ?? "",
      },
    });
    const invoice = await refreshInvoicePaid(input.invoiceId, tx);
    return { payment, invoice };
  });
}

/** Square payment status -> ours. APPROVED means authorized but not captured; we autocomplete so treat as pending. */
export function mapSquareStatus(s: string): PaymentStatus {
  if (s === "COMPLETED") return "COMPLETED";
  if (s === "FAILED" || s === "CANCELED") return "FAILED";
  return "PENDING";
}
