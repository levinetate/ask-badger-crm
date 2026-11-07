import Link from "next/link";
import { notFound } from "next/navigation";
import DocEditForm from "@/components/DocEditForm";
import DocView from "@/components/DocView";
import { db, getSettings } from "@/lib/db";
import { editorMaterials, toLineInputs } from "@/lib/docData";
import { amountDueCents, DOC_STATUS_CLASS, estimateNumber, INVOICE_STATUS_LABEL, invoiceNumber, PAYMENT_METHOD_LABEL } from "@/lib/documents";
import { appUrl } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { formatDate, formatDateTime, zonedDateStr } from "@/lib/time";
import { deleteInvoice, deletePayment, recordManualPayment, saveInvoice, saveInvoiceAndSend, sendInvoice, voidInvoice } from "../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; edit?: string }> };

export default async function InvoiceDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const inv = await db.invoice.findUnique({
    where: { id: Number(id) || 0 },
    include: { customer: true, lineItems: true, payments: { orderBy: { createdAt: "asc" } }, estimate: true },
  });
  if (!inv) notFound();
  const s = await getSettings();
  const hasPayments = inv.payments.some((p) => p.status !== "FAILED");
  const editable = (inv.status === "DRAFT" || inv.status === "SENT") && !hasPayments;
  const editing = editable && (inv.status === "DRAFT" || sp.edit === "1");
  const due = amountDueCents(inv);
  const hidden = <input type="hidden" name="id" value={inv.id} />;

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Link href="/admin/invoices" className="link text-sm">← Invoices</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-semibold">Invoice {invoiceNumber(inv.id)}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${DOC_STATUS_CLASS[inv.status]}`}>{INVOICE_STATUS_LABEL[inv.status]}</span>
        </div>
        {sp.saved && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Saved.</p>}
        {sp.sent && <p className="rounded bg-green-50 p-2 text-sm text-green-900">Emailed to {inv.customer.email}.</p>}
        <div className="flex flex-wrap gap-2">
          {inv.status === "SENT" && editable && !editing && <Link className="btn-secondary" href={`/admin/invoices/${inv.id}?edit=1`}>Edit</Link>}
          {inv.status === "SENT" && <form action={sendInvoice}>{hidden}<button className="btn-secondary">Resend email</button></form>}
          {(inv.status === "SENT" || inv.status === "DRAFT") && !hasPayments && <form action={voidInvoice}>{hidden}<button className="btn-danger">Void</button></form>}
          {inv.status === "DRAFT" && <form action={deleteInvoice}>{hidden}<button className="btn-danger">Delete draft</button></form>}
          {inv.estimate && <Link className="btn-secondary" href={`/admin/estimates/${inv.estimate.id}`}>From estimate {estimateNumber(inv.estimate.id)}</Link>}
        </div>
        {inv.status !== "DRAFT" && <p className="break-all text-xs text-stone-500">Customer pay link: {appUrl(`/i/${inv.token}`)}</p>}

        {editing ? (
          <DocEditForm
            action={saveInvoice}
        sendAction={saveInvoiceAndSend}
            kind="invoice"
            id={inv.id}
            customers={await db.customer.findMany({ orderBy: { name: "asc" }, take: 1000 })}
            customerId={inv.customerId}
            appointmentId={inv.appointmentId}
            title={inv.title}
            notes={inv.notes}
            jobAddress={inv.jobAddress}
            date={inv.dueDate ? zonedDateStr(inv.dueDate, s.timezone) : ""}
            lines={toLineInputs(inv.lineItems)}
            materials={await editorMaterials()}
            laborRateCents={s.laborRateCents}
            taxRatePercent={Number(inv.taxRatePercent)}
          />
        ) : (
          <DocView doc={inv} label="Invoice" number={invoiceNumber(inv.id)} settings={s} dateLine={inv.dueDate ? `Due ${formatDate(inv.dueDate, s.timezone)}` : undefined} />
        )}
      </div>

      <aside className="space-y-4 lg:pt-16">
        <div className="card">
          <div className="text-sm text-stone-500">Balance due</div>
          <div className="text-3xl font-semibold">{formatMoney(inv.status === "VOID" ? 0 : due)}</div>
          <div className="text-sm text-stone-600">Paid {formatMoney(inv.amountPaidCents)} of {formatMoney(inv.totalCents)}</div>
        </div>
        <div className="card">
          <h2 className="mb-2 font-medium">Payments</h2>
          <ul className="space-y-2 text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2">
                <span>
                  {PAYMENT_METHOD_LABEL[p.method]}{p.status !== "COMPLETED" && <span className={p.status === "FAILED" ? "text-red-700" : "text-amber-800"}> · {p.status.toLowerCase()}</span>}
                  {p.note && <span className="text-stone-500"> · {p.note}</span>}
                  <div className="text-xs text-stone-500">{formatDateTime(p.createdAt, s.timezone)}{p.receiptUrl && <> · <a className="link" href={p.receiptUrl} target="_blank">Square receipt</a></>}</div>
                </span>
                <span className="text-right">
                  {formatMoney(p.amountCents)}
                  {!p.squarePaymentId && <form action={deletePayment}><input type="hidden" name="paymentId" value={p.id} /><button className="link text-xs">Remove</button></form>}
                </span>
              </li>
            ))}
            {inv.payments.length === 0 && <li className="text-stone-500">None yet.</li>}
          </ul>
        </div>
        {inv.status !== "VOID" && inv.status !== "DRAFT" && due > 0 && (
          <form action={recordManualPayment} className="card space-y-2">
            <h2 className="font-medium">Record a payment</h2>
            <p className="text-xs text-stone-500">For Zelle, cash, or check. Square payments record themselves.</p>
            {hidden}
            <select className="input" name="method" defaultValue="ZELLE">
              <option value="ZELLE">Zelle</option><option value="CASH">Cash</option><option value="CHECK">Check</option><option value="OTHER">Other</option>
            </select>
            <input className="input" name="amount" inputMode="decimal" defaultValue={(due / 100).toFixed(2)} aria-label="Amount" required />
            <input className="input" name="note" placeholder="Check # or Zelle confirmation (optional)" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="receipt" defaultChecked /> Email the customer a receipt</label>
            <button className="btn-primary w-full">Record payment</button>
          </form>
        )}
      </aside>
    </div>
  );
}
