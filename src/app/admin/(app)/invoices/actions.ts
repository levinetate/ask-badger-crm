"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { newToken } from "@/lib/booking";
import { lineCreateData } from "@/lib/docData";
import { docFormSchema, resolveCustomer } from "@/lib/docForm";
import { amountDueCents, computeTotals, invoiceNumber, PAYMENT_METHOD_LABEL } from "@/lib/documents";
import { db, getSettings } from "@/lib/db";
import { emailInvoice, emailReceipt } from "@/lib/notifications";
import { addPayment, refreshInvoicePaid } from "@/lib/payments";
import { zonedToUtc } from "@/lib/time";

export async function saveInvoice(form: FormData) {
  return saveInvoiceImpl(form, false);
}

export async function saveInvoiceAndSend(form: FormData) {
  return saveInvoiceImpl(form, true);
}

async function saveInvoiceImpl(form: FormData, send: boolean) {
  await requireAdmin();
  const d = docFormSchema.parse(Object.fromEntries(form));
  const s = await getSettings();
  const customerId = await resolveCustomer(d);
  const existing = d.id ? await db.invoice.findUniqueOrThrow({ where: { id: d.id }, include: { payments: true } }) : null;
  if (existing && (existing.status === "PAID" || existing.status === "VOID" || existing.payments.some((p) => p.status !== "FAILED"))) {
    throw new Error("Invoices with payments can't be edited");
  }
  const rate = existing ? Number(existing.taxRatePercent) : Number(s.taxRatePercent);
  const totals = computeTotals(d.lines, rate);
  const data = {
    customerId,
    appointmentId: d.appointmentId ?? null,
    title: d.title,
    notes: d.notes,
    jobAddress: d.jobAddress,
    dueDate: d.date ? zonedToUtc(d.date, 23 * 60 + 59, s.timezone) : null,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
  };
  const inv = existing
    ? await db.invoice.update({ where: { id: existing.id }, data: { ...data, lineItems: { deleteMany: {}, create: lineCreateData(d.lines) } } })
    : await db.invoice.create({ data: { ...data, token: newToken(), taxRatePercent: rate, lineItems: { create: lineCreateData(d.lines) } } });
  if (send) return sendInvoiceById(inv.id);
  redirect(`/admin/invoices/${inv.id}?saved=1`);
}

async function sendInvoiceById(id: number) {
  const s = await getSettings();
  const current = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (current.totalCents <= 0) throw new Error("Add at least one line before sending");
  const inv = await db.invoice.update({
    where: { id },
    data: { status: current.status === "DRAFT" ? "SENT" : current.status, sentAt: new Date() },
    include: { customer: true },
  });
  await emailInvoice(s, { ...inv, number: invoiceNumber(inv.id), dueCents: amountDueCents(inv) });
  redirect(`/admin/invoices/${id}?sent=1`);
}

const idOnly = z.object({ id: z.coerce.number().int().positive() });

export async function sendInvoice(form: FormData) {
  await requireAdmin();
  const { id } = idOnly.parse(Object.fromEntries(form));
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status === "VOID" || inv.status === "PAID") throw new Error("This invoice is closed");
  return sendInvoiceById(id);
}

export async function voidInvoice(form: FormData) {
  await requireAdmin();
  const { id } = idOnly.parse(Object.fromEntries(form));
  const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true } });
  if (inv.payments.some((p) => p.status === "COMPLETED" || p.status === "PENDING")) throw new Error("Refund or remove payments before voiding");
  await db.invoice.update({ where: { id }, data: { status: "VOID" } });
  revalidatePath(`/admin/invoices/${id}`);
}

export async function deleteInvoice(form: FormData) {
  await requireAdmin();
  const { id } = idOnly.parse(Object.fromEntries(form));
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status !== "DRAFT") throw new Error("Only drafts can be deleted");
  await db.$transaction(async (tx) => {
    if (inv.estimateId) await tx.estimate.update({ where: { id: inv.estimateId }, data: { status: "APPROVED" } });
    await tx.invoice.delete({ where: { id } });
  });
  redirect("/admin/invoices");
}

const manualSchema = idOnly.extend({
  method: z.enum(["ZELLE", "CASH", "CHECK", "OTHER"]),
  amount: z.string().transform((s) => Math.round(Number(s.replace(/[$,]/g, "")) * 100)).pipe(z.number().int().positive()),
  note: z.string().trim().max(300).default(""),
  receipt: z.string().optional(),
});

/** Records a payment taken outside Square (Zelle, cash, check). */
export async function recordManualPayment(form: FormData) {
  await requireAdmin();
  const d = manualSchema.parse(Object.fromEntries(form));
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: d.id }, include: { customer: true } });
  if (inv.status === "VOID") throw new Error("This invoice is void");
  await addPayment({ invoiceId: inv.id, method: d.method, status: "COMPLETED", amountCents: d.amount, note: d.note });
  if (d.receipt === "on") await emailReceipt(await getSettings(), { ...inv, number: invoiceNumber(inv.id) }, d.amount, PAYMENT_METHOD_LABEL[d.method]);
  revalidatePath(`/admin/invoices/${d.id}`);
}

/** Removes a manual payment entered by mistake. Square payments must be refunded in Square. */
export async function deletePayment(form: FormData) {
  await requireAdmin();
  const pid = z.coerce.number().int().positive().parse(form.get("paymentId"));
  const p = await db.payment.findUniqueOrThrow({ where: { id: pid } });
  if (p.squarePaymentId) throw new Error("Refund Square payments from your Square dashboard");
  await db.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: pid } });
    await refreshInvoicePaid(p.invoiceId, tx);
  });
  revalidatePath(`/admin/invoices/${p.invoiceId}`);
}
