import type { Appointment, BusinessSettings, Customer, ServiceType } from "@prisma/client";
import { appUrl, escapeHtml, sendEmail } from "./email";
import { formatDateTime } from "./time";

type Full = Appointment & { customer: Customer; serviceType: ServiceType };
type Kind = "booked" | "reminder" | "rescheduled" | "cancelled";

function render(appt: Full, s: BusinessSettings, kind: Kind) {
  const when = formatDateTime(appt.startAt, s.timezone);
  const link = appUrl(`/a/${appt.token}`);
  const intro: Record<Kind, string> = {
    booked:
      appt.status === "CONFIRMED"
        ? `Your appointment is confirmed for ${when}.`
        : `You're booked for ${when}. Please confirm you can make it.`,
    reminder:
      appt.status === "CONFIRMED"
        ? `Reminder: we'll see you ${when}.`
        : `Reminder: your appointment is ${when}. Please confirm you can still make it.`,
    rescheduled: `Your appointment has moved to ${when}.`,
    cancelled: `Your appointment for ${when} has been cancelled.`,
  };
  const subject: Record<Kind, string> = {
    booked: `${s.businessName}: please confirm your appointment`,
    reminder: `${s.businessName}: appointment reminder`,
    rescheduled: `${s.businessName}: appointment rescheduled`,
    cancelled: `${s.businessName}: appointment cancelled`,
  };
  if (kind === "booked" && appt.status === "CONFIRMED") subject.booked = `${s.businessName}: appointment confirmed`;

  const lines = [
    `Hi ${appt.customer.name},`,
    intro[kind],
    `Service: ${appt.serviceType.name}`,
    appt.jobAddress ? `Address: ${appt.jobAddress}` : "",
    kind === "cancelled" ? "" : `Confirm, reschedule, or cancel here: ${link}`,
    s.phone ? `Questions? Call ${s.phone}.` : "",
    `- ${s.businessName}`,
  ].filter(Boolean);

  const button =
    kind === "cancelled"
      ? ""
      : `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none">${
          appt.status === "CONFIRMED" ? "View appointment" : "Confirm appointment"
        }</a></p><p style="font-size:13px;color:#555">You can also reschedule or cancel from that page.</p>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
<p>Hi ${escapeHtml(appt.customer.name)},</p>
<p>${escapeHtml(intro[kind])}</p>
<p><strong>${escapeHtml(appt.serviceType.name)}</strong>${appt.jobAddress ? `<br>${escapeHtml(appt.jobAddress)}` : ""}</p>
${button}
${s.phone ? `<p>Questions? Call ${escapeHtml(s.phone)}.</p>` : ""}
<p>${escapeHtml(s.businessName)}</p></div>`;

  return { to: appt.customer.email, subject: subject[kind], text: lines.join("\n\n"), html };
}

export async function notifyCustomer(appt: Full, s: BusinessSettings, kind: Kind) {
  await sendEmail(render(appt, s, kind));
}

/** Short heads-up to the owner when a customer books, reschedules, or cancels. */
export async function notifyOwner(appt: Full, s: BusinessSettings, what: string) {
  if (!s.ownerEmail) return;
  const when = formatDateTime(appt.startAt, s.timezone);
  const text = `${appt.customer.name} ${what}: ${appt.serviceType.name}, ${when}.\n\n${appUrl(`/admin/appointments/${appt.id}`)}`;
  await sendEmail({
    to: s.ownerEmail,
    subject: `${appt.customer.name} ${what}`,
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
  });
}

// --- Estimates and invoices ---

function docEmail(s: BusinessSettings, to: string, subject: string, paragraphs: string[], button?: { label: string; url: string }) {
  const text = [...paragraphs, button ? `${button.label}: ${button.url}` : "", s.phone ? `Questions? Call ${s.phone}.` : "", `- ${s.businessName}`]
    .filter(Boolean)
    .join("\n\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${button ? `<p><a href="${button.url}" style="display:inline-block;padding:10px 18px;background:#b45309;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(button.label)}</a></p>` : ""}
${s.phone ? `<p>Questions? Call ${escapeHtml(s.phone)}.</p>` : ""}
<p>${escapeHtml(s.businessName)}</p></div>`;
  return sendEmail({ to, subject, text, html });
}

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);

export function emailEstimate(s: BusinessSettings, e: { token: string; number: string; totalCents: number; title: string; customer: Customer }) {
  return docEmail(
    s,
    e.customer.email,
    `${s.businessName}: estimate ${e.number}${e.title ? ` for ${e.title}` : ""}`,
    [`Hi ${e.customer.name},`, `Here is your estimate ${e.number} for ${usd(e.totalCents)}. You can review and approve it online.`],
    { label: "Review estimate", url: appUrl(`/e/${e.token}`) },
  );
}

export function emailInvoice(s: BusinessSettings, i: { token: string; number: string; dueCents: number; dueDate: Date | null; customer: Customer }) {
  const due = i.dueDate ? ` It's due ${new Intl.DateTimeFormat("en-US", { timeZone: s.timezone, month: "long", day: "numeric" }).format(i.dueDate)}.` : "";
  return docEmail(
    s,
    i.customer.email,
    `${s.businessName}: invoice ${i.number}`,
    [`Hi ${i.customer.name},`, `Here is invoice ${i.number} for ${usd(i.dueCents)}.${due} You can pay online by card, Apple Pay, Google Pay, Cash App, or bank transfer${s.zelleInfo ? ", or by Zelle" : ""}.`],
    { label: "View and pay invoice", url: appUrl(`/i/${i.token}`) },
  );
}

export function emailReceipt(s: BusinessSettings, i: { token: string; number: string; customer: Customer }, amountCents: number, method: string) {
  return docEmail(
    s,
    i.customer.email,
    `${s.businessName}: payment received for ${i.number}`,
    [`Hi ${i.customer.name},`, `Thanks! We received your payment of ${usd(amountCents)} (${method}) for invoice ${i.number}.`],
    { label: "View invoice", url: appUrl(`/i/${i.token}`) },
  );
}

export async function notifyOwnerText(s: BusinessSettings, subject: string, line: string, adminPath: string) {
  if (!s.ownerEmail) return;
  const text = `${line}\n\n${appUrl(adminPath)}`;
  await sendEmail({ to: s.ownerEmail, subject, text, html: `<p>${escapeHtml(line)}</p><p><a href="${appUrl(adminPath)}">Open</a></p>` });
}
