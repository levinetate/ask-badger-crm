// Records when a customer first opens an estimate or invoice, and tells the owner once.
// "email" = the tracking image in the email loaded; "link" = the customer opened the page.
// Note: Apple Mail Privacy Protection preloads images, so an email "open" can fire without
// the customer actually reading it. A link view is the stronger signal.

import { cookies } from "next/headers";
import { db, getSettings } from "./db";
import { estimateNumber, invoiceNumber } from "./documents";
import { notifyOwnerText } from "./notifications";
import { SESSION_COOKIE, isValidSession } from "./session";

export type DocKind = "e" | "i";
export type OpenVia = "email" | "link";

/** True when the signed-in owner is looking at a customer page, so their own views don't count. */
export async function viewerIsOwner(): Promise<boolean> {
  try {
    const jar = await cookies();
    return await isValidSession(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return false;
  }
}

export async function recordOpen(kind: DocKind, token: string, via: OpenVia): Promise<void> {
  try {
    const now = new Date();
    const field = via === "email" ? "openedAt" : "viewedAt";
    if (kind === "e") {
      const doc = await db.estimate.findUnique({ where: { token }, include: { customer: true } });
      if (!doc || doc.status === "DRAFT" || doc[field]) return;
      const res = await db.estimate.updateMany({ where: { token, [field]: null }, data: { [field]: now } });
      if (res.count === 0 || doc.openedAt || doc.viewedAt) return;
      await tellOwner(`${doc.customer.name} opened estimate ${estimateNumber(doc.id)}`, via, `/admin/estimates/${doc.id}`);
    } else {
      const doc = await db.invoice.findUnique({ where: { token }, include: { customer: true } });
      if (!doc || doc.status === "DRAFT" || doc[field]) return;
      const res = await db.invoice.updateMany({ where: { token, [field]: null }, data: { [field]: now } });
      if (res.count === 0 || doc.openedAt || doc.viewedAt) return;
      await tellOwner(`${doc.customer.name} opened invoice ${invoiceNumber(doc.id)}`, via, `/admin/invoices/${doc.id}`);
    }
  } catch (err) {
    console.error("recordOpen failed", err);
  }
}

async function tellOwner(subject: string, via: OpenVia, adminPath: string) {
  const s = await getSettings();
  if (!s.notifyOnOpen) return;
  const how = via === "email" ? "They opened your email." : "They opened the link to view it.";
  await notifyOwnerText(s, subject, `${subject}. ${how}`, adminPath);
}
