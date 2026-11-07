"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { newToken } from "@/lib/booking";
import { lineCreateData } from "@/lib/docData";
import { docFormSchema, resolveCustomer } from "@/lib/docForm";
import { computeTotals, estimateNumber, invoiceNumber } from "@/lib/documents";
import { db, getSettings } from "@/lib/db";
import { emailEstimate } from "@/lib/notifications";
import { addDaysStr, zonedDateStr, zonedToUtc } from "@/lib/time";

export async function saveEstimate(form: FormData) {
  return saveEstimateImpl(form, false);
}

export async function saveEstimateAndSend(form: FormData) {
  return saveEstimateImpl(form, true);
}

async function saveEstimateImpl(form: FormData, send: boolean) {
  await requireAdmin();
  const d = docFormSchema.parse(Object.fromEntries(form));
  const s = await getSettings();
  const customerId = await resolveCustomer(d);
  const existing = d.id ? await db.estimate.findUniqueOrThrow({ where: { id: d.id } }) : null;
  if (existing && existing.status !== "DRAFT" && existing.status !== "SENT") throw new Error("Approved or declined estimates can't be edited");
  const rate = existing ? Number(existing.taxRatePercent) : Number(s.taxRatePercent);
  const totals = computeTotals(d.lines, rate);
  const data = {
    customerId,
    appointmentId: d.appointmentId ?? null,
    title: d.title,
    notes: d.notes,
    jobAddress: d.jobAddress,
    validUntil: d.date ? zonedToUtc(d.date, 23 * 60 + 59, s.timezone) : null,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
  };
  const est = existing
    ? await db.estimate.update({ where: { id: existing.id }, data: { ...data, lineItems: { deleteMany: {}, create: lineCreateData(d.lines) } } })
    : await db.estimate.create({ data: { ...data, token: newToken(), taxRatePercent: rate, lineItems: { create: lineCreateData(d.lines) } } });
  if (send) return sendEstimateById(est.id);
  redirect(`/admin/estimates/${est.id}?saved=1`);
}

async function sendEstimateById(id: number) {
  const s = await getSettings();
  const est = await db.estimate.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
    include: { customer: true },
  });
  await emailEstimate(s, { ...est, number: estimateNumber(est.id) });
  redirect(`/admin/estimates/${id}?sent=1`);
}

const idOnly = z.object({ id: z.coerce.number().int().positive() });

export async function sendEstimate(form: FormData) {
  await requireAdmin();
  const { id } = idOnly.parse(Object.fromEntries(form));
  const est = await db.estimate.findUniqueOrThrow({ where: { id } });
  if (est.status !== "DRAFT" && est.status !== "SENT") throw new Error("This estimate was already answered");
  return sendEstimateById(id);
}

export async function setEstimateStatus(form: FormData) {
  await requireAdmin();
  const { id, status } = idOnly.extend({ status: z.enum(["DRAFT", "SENT", "APPROVED", "DECLINED"]) }).parse(Object.fromEntries(form));
  await db.estimate.update({
    where: { id },
    data: {
      status,
      ...(status === "APPROVED" ? { approvedAt: new Date(), approvedName: "Marked by owner" } : {}),
      ...(status === "DECLINED" ? { declinedAt: new Date() } : {}),
    },
  });
  revalidatePath(`/admin/estimates/${id}`);
}

export async function deleteEstimate(form: FormData) {
  await requireAdmin();
  const { id } = idOnly.parse(Object.fromEntries(form));
  const est = await db.estimate.findUniqueOrThrow({ where: { id } });
  if (est.status !== "DRAFT") throw new Error("Only drafts can be deleted");
  await db.estimate.delete({ where: { id } });
  redirect("/admin/estimates");
}

/** Copies an estimate's lines into a new draft invoice. */
export async function convertToInvoice(form: FormData) {
  await requireAdmin();
  const { id } = idOnly.parse(Object.fromEntries(form));
  const s = await getSettings();
  const est = await db.estimate.findUniqueOrThrow({ where: { id }, include: { lineItems: true, invoice: true } });
  if (est.invoice) redirect(`/admin/invoices/${est.invoice.id}`);
  const due = zonedToUtc(addDaysStr(zonedDateStr(new Date(), s.timezone), s.invoiceDueDays), 23 * 60 + 59, s.timezone);
  const inv = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        customerId: est.customerId,
        estimateId: est.id,
        appointmentId: est.appointmentId,
        token: newToken(),
        title: est.title,
        notes: est.notes ? `${est.notes}\n\nBased on estimate ${estimateNumber(est.id)}.` : `Based on estimate ${estimateNumber(est.id)}.`,
        jobAddress: est.jobAddress,
        dueDate: due,
        taxRatePercent: est.taxRatePercent,
        subtotalCents: est.subtotalCents,
        taxCents: est.taxCents,
        totalCents: est.totalCents,
        lineItems: {
          create: est.lineItems.map(({ kind, description, quantity, unitPriceCents, taxable, materialId, sortOrder }) => ({
            kind, description, quantity, unitPriceCents, taxable, materialId, sortOrder,
          })),
        },
      },
    });
    await tx.estimate.update({ where: { id: est.id }, data: { status: "INVOICED" } });
    return created;
  });
  redirect(`/admin/invoices/${inv.id}?from=${encodeURIComponent(invoiceNumber(inv.id))}`);
}
