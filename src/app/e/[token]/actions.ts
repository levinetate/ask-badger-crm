"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, getSettings } from "@/lib/db";
import { estimateNumber } from "@/lib/documents";
import { notifyOwnerText } from "@/lib/notifications";

const base = z.object({ token: z.string().min(10).max(100) });

async function loadOpen(token: string) {
  const est = await db.estimate.findUnique({ where: { token }, include: { customer: true } });
  if (!est) redirect("/");
  if (est.status !== "SENT") redirect(`/e/${token}`);
  if (est.validUntil && est.validUntil < new Date()) redirect(`/e/${token}?expired=1`);
  return est;
}

export async function approveEstimate(form: FormData) {
  const { token, name } = base.extend({ name: z.string().trim().min(2).max(120) }).parse(Object.fromEntries(form));
  if (form.get("agree") !== "on") redirect(`/e/${token}?need=agree`);
  const est = await loadOpen(token);
  // Only move SENT -> APPROVED once, even with double clicks.
  const { count } = await db.estimate.updateMany({ where: { id: est.id, status: "SENT" }, data: { status: "APPROVED", approvedAt: new Date(), approvedName: name } });
  if (count) await notifyOwnerText(await getSettings(), `${est.customer.name} approved ${estimateNumber(est.id)}`, `${name} approved estimate ${estimateNumber(est.id)}.`, `/admin/estimates/${est.id}`);
  redirect(`/e/${token}?approved=1`);
}

export async function declineEstimate(form: FormData) {
  const { token, reason } = base.extend({ reason: z.string().trim().max(1000).default("") }).parse(Object.fromEntries(form));
  const est = await loadOpen(token);
  const { count } = await db.estimate.updateMany({ where: { id: est.id, status: "SENT" }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason } });
  if (count) await notifyOwnerText(await getSettings(), `${est.customer.name} declined ${estimateNumber(est.id)}`, `Estimate ${estimateNumber(est.id)} was declined.${reason ? ` Reason: ${reason}` : ""}`, `/admin/estimates/${est.id}`);
  redirect(`/e/${token}?declined=1`);
}
