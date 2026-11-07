import Link from "next/link";
import DocEditForm from "@/components/DocEditForm";
import { db, getSettings } from "@/lib/db";
import { editorMaterials, linesFromAppointment } from "@/lib/docData";
import { addDaysStr, zonedDateStr } from "@/lib/time";
import { saveEstimate, saveEstimateAndSend } from "../actions";

type Props = { searchParams: Promise<{ customer?: string; appointment?: string }> };

export default async function NewEstimatePage({ searchParams }: Props) {
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
      <Link href="/admin/estimates" className="link text-sm">← Estimates</Link>
      <h1 className="text-2xl font-semibold">New estimate</h1>
      {!s.laborRateCents && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Tip: set your hourly labor rate in <Link className="link" href="/admin/settings">Settings</Link> so labor lines fill in automatically.</p>}
      <DocEditForm
        action={saveEstimate}
        sendAction={saveEstimateAndSend}
        kind="estimate"
        customers={customers}
        customerId={appt?.customerId ?? (Number(sp.customer) || null)}
        appointmentId={appt?.id}
        title={appt?.serviceType.name ?? ""}
        jobAddress={appt?.jobAddress ?? ""}
        date={addDaysStr(zonedDateStr(new Date(), s.timezone), 30)}
        lines={lines}
        materials={materials}
        laborRateCents={s.laborRateCents}
        taxRatePercent={Number(s.taxRatePercent)}
      />
    </div>
  );
}
