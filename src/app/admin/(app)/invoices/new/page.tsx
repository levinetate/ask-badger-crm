import Link from "next/link";
import DocEditForm from "@/components/DocEditForm";
import { db, getSettings } from "@/lib/db";
import { editorMaterials, linesFromAppointment } from "@/lib/docData";
import { addDaysStr, zonedDateStr } from "@/lib/time";
import { saveInvoice, saveInvoiceAndSend } from "../actions";

type Props = { searchParams: Promise<{ customer?: string; appointment?: string }> };

export default async function NewInvoicePage({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSettings();
  const appt = sp.appointment ? await db.appointment.findUnique({ where: { id: Number(sp.appointment) || 0 }, include: { serviceType: true } }) : null;
  const [customers, materials, lines] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, take: 1000 }),
    editorMaterials(),
    appt ? linesFromAppointment(appt.id) : Promise.resolve([]),
  ]);
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/admin/invoices" className="link text-sm">← Invoices</Link>
      <h1 className="text-2xl font-semibold">New invoice</h1>
      <DocEditForm
        action={saveInvoice}
        sendAction={saveInvoiceAndSend}
        kind="invoice"
        customers={customers}
        customerId={appt?.customerId ?? (Number(sp.customer) || null)}
        appointmentId={appt?.id}
        title={appt?.serviceType.name ?? ""}
        jobAddress={appt?.jobAddress ?? ""}
        date={addDaysStr(zonedDateStr(new Date(), s.timezone), s.invoiceDueDays)}
        lines={lines}
        materials={materials}
        laborRateCents={s.laborRateCents}
        taxRatePercent={Number(s.taxRatePercent)}
      />
    </div>
  );
}
