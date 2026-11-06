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
