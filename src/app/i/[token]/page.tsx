import { notFound } from "next/navigation";
import DocView from "@/components/DocView";
import PublicShell from "@/components/PublicShell";
import { db, getSettings } from "@/lib/db";
import { amountDueCents, invoiceNumber, PAYMENT_METHOD_LABEL } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { squareConfigured, squareEnv } from "@/lib/square";
import { formatDate } from "@/lib/time";
import SquarePay from "./SquarePay";

export const dynamic = "force-dynamic";

export default async function CustomerInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invoice.findUnique({ where: { token }, include: { customer: true, lineItems: true, payments: { orderBy: { createdAt: "asc" } } } });
  if (!inv || inv.status === "DRAFT") notFound();
  const s = await getSettings();
  const due = amountDueCents(inv);
  const pending = inv.payments.find((p) => p.status === "PENDING");
  const sq = squareEnv();
  const number = invoiceNumber(inv.id);
  const paidLines = inv.payments.filter((p) => p.status === "COMPLETED");

  return (
    <PublicShell>
      {inv.status === "PAID" && <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-900">Paid in full. Thank you!</p>}
      {inv.status === "VOID" && <p className="mb-4 rounded-md bg-stone-100 p-3 text-sm">This invoice was cancelled. Nothing is owed.</p>}
      {pending && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">A payment of {formatMoney(pending.amountCents)} ({PAYMENT_METHOD_LABEL[pending.method]}) is processing.</p>}

      <DocView
        doc={inv}
        label="Invoice"
        number={number}
        settings={s}
        dateLine={inv.dueDate ? `Due ${formatDate(inv.dueDate, s.timezone)}` : undefined}
        extra={
          <>
            {paidLines.map((p) => (
              <div key={p.id} className="flex justify-between text-green-800"><dt>Paid ({PAYMENT_METHOD_LABEL[p.method]}, {formatDate(p.createdAt, s.timezone)})</dt><dd>−{formatMoney(p.amountCents)}</dd></div>
            ))}
            {inv.status !== "VOID" && <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold"><dt>Balance due</dt><dd>{formatMoney(due)}</dd></div>}
          </>
        }
      />

      {inv.status === "SENT" && due > 0 && !pending && (
        <div className="mt-6 space-y-4">
          {squareConfigured() ? (
            <SquarePay sdkUrl={sq.sdkUrl} applicationId={sq.applicationId} locationId={sq.locationId} token={token} amountCents={due} customerName={inv.customer.name} businessName={s.businessName} />
          ) : (
            <p className="card text-sm text-stone-600">Online card payment isn&apos;t available yet. Please use one of the options below.</p>
          )}
          {s.zelleInfo && (
            <div className="card space-y-1 text-sm">
              <h2 className="font-medium">Pay with Zelle</h2>
              <p>Send {formatMoney(due)} to <strong>{s.zelleInfo}</strong> from your bank&apos;s app, and put <strong>{number}</strong> in the memo.</p>
              <p className="text-stone-500">We&apos;ll mark the invoice paid when it arrives.</p>
            </div>
          )}
        </div>
      )}
    </PublicShell>
  );
}
