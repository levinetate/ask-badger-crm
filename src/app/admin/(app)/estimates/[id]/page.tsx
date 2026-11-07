import Link from "next/link";
import { notFound } from "next/navigation";
import DocEditForm from "@/components/DocEditForm";
import DocView from "@/components/DocView";
import { db, getSettings } from "@/lib/db";
import { editorMaterials, toLineInputs } from "@/lib/docData";
import { DOC_STATUS_CLASS, ESTIMATE_STATUS_LABEL, estimateNumber, invoiceNumber } from "@/lib/documents";
import { appUrl } from "@/lib/email";
import { formatDate, formatDateTime, zonedDateStr } from "@/lib/time";
import { convertToInvoice, deleteEstimate, saveEstimate, saveEstimateAndSend, sendEstimate, setEstimateStatus } from "../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; edit?: string }> };

export default async function EstimateDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const est = await db.estimate.findUnique({ where: { id: Number(id) || 0 }, include: { customer: true, lineItems: true, invoice: true } });
  if (!est) notFound();
  const s = await getSettings();
  const editable = est.status === "DRAFT" || est.status === "SENT";
  const editing = editable && (est.status === "DRAFT" || sp.edit === "1");
  const hidden = <input type="hidden" name="id" value={est.id} />;
  const statusBtn = (status: string, label: string) => (
    <form action={setEstimateStatus}>{hidden}<input type="hidden" name="status" value={status} /><button className="btn-secondary">{label}</button></form>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/admin/estimates" className="link text-sm">← Estimates</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Estimate {estimateNumber(est.id)}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${DOC_STATUS_CLASS[est.status]}`}>{ESTIMATE_STATUS_LABEL[est.status]}</span>
      </div>
      {sp.saved && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Saved.</p>}
      {sp.sent && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Emailed to {est.customer.email}.</p>}
      {est.status === "APPROVED" && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Approved by {est.approvedName} {est.approvedAt && `on ${formatDateTime(est.approvedAt, s.timezone)}`}.</p>}
      {est.status === "DECLINED" && <p className="rounded bg-red-50 p-2 text-sm text-red-800">Declined{est.declineReason ? `: ${est.declineReason}` : "."}</p>}

      <div className="flex flex-wrap gap-2">
        {est.status === "SENT" && !editing && <Link className="btn-secondary" href={`/admin/estimates/${est.id}?edit=1`}>Edit</Link>}
        {est.status === "SENT" && <form action={sendEstimate}>{hidden}<button className="btn-secondary">Resend email</button></form>}
        {(est.status === "SENT" || est.status === "DRAFT") && statusBtn("APPROVED", "Mark approved")}
        {est.status === "SENT" && statusBtn("DECLINED", "Mark declined")}
        {(est.status === "APPROVED" || est.status === "SENT") && !est.invoice && <form action={convertToInvoice}>{hidden}<button className="btn-primary">Create invoice from this</button></form>}
        {est.invoice && <Link className="btn-secondary" href={`/admin/invoices/${est.invoice.id}`}>Open invoice {invoiceNumber(est.invoice.id)}</Link>}
        {est.status === "DECLINED" && statusBtn("DRAFT", "Reopen as draft")}
        {est.status === "DRAFT" && <form action={deleteEstimate}>{hidden}<button className="btn-danger">Delete draft</button></form>}
      </div>
      {est.status !== "DRAFT" && <p className="break-all text-xs text-stone-500">Customer link: {appUrl(`/e/${est.token}`)}</p>}

      {editing ? (
        <DocEditForm
          action={saveEstimate}
        sendAction={saveEstimateAndSend}
          kind="estimate"
          id={est.id}
          customers={await db.customer.findMany({ orderBy: { name: "asc" }, take: 1000 })}
          customerId={est.customerId}
          appointmentId={est.appointmentId}
          title={est.title}
          notes={est.notes}
          jobAddress={est.jobAddress}
          date={est.validUntil ? zonedDateStr(est.validUntil, s.timezone) : ""}
          lines={toLineInputs(est.lineItems)}
          materials={await editorMaterials()}
          laborRateCents={s.laborRateCents}
          taxRatePercent={Number(est.taxRatePercent)}
        />
      ) : (
        <DocView doc={est} label="Estimate" number={estimateNumber(est.id)} settings={s}
          dateLine={est.validUntil ? `Valid until ${formatDate(est.validUntil, s.timezone)}` : undefined} />
      )}
    </div>
  );
}
