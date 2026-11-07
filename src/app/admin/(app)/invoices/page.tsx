import Link from "next/link";
import { db, getSettings } from "@/lib/db";
import { amountDueCents, DOC_STATUS_CLASS, INVOICE_STATUS_LABEL, invoiceNumber } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { formatDate } from "@/lib/time";

type Props = { searchParams: Promise<{ status?: string }> };
const FILTERS = ["DRAFT", "SENT", "PAID", "VOID"] as const;

export default async function InvoicesPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const s = await getSettings();
  const filter = FILTERS.find((f) => f === status);
  const [list, open] = await Promise.all([
    db.invoice.findMany({ where: filter ? { status: filter } : {}, include: { customer: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.invoice.findMany({ where: { status: "SENT" }, select: { totalCents: true, amountPaidCents: true, dueDate: true } }),
  ]);
  const now = new Date();
  const outstanding = open.reduce((a, i) => a + amountDueCents(i), 0);
  const overdue = open.filter((i) => i.dueDate && i.dueDate < now).reduce((a, i) => a + amountDueCents(i), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Invoices</h1>
        <Link href="/admin/invoices/new" className="btn-primary">New invoice</Link>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="card py-3"><div className="text-sm text-stone-500">Outstanding</div><div className="text-2xl font-semibold">{formatMoney(outstanding)}</div></div>
        <div className="card py-3"><div className="text-sm text-stone-500">Overdue</div><div className={`text-2xl font-semibold ${overdue ? "text-red-700" : ""}`}>{formatMoney(overdue)}</div></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/invoices" className={!filter ? "font-semibold" : "link"}>All</Link>
        {FILTERS.map((f) => <Link key={f} href={`/admin/invoices?status=${f}`} className={filter === f ? "font-semibold" : "link"}>{INVOICE_STATUS_LABEL[f]}</Link>)}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-stone-500">
            <tr><th className="p-3">#</th><th className="p-3">Customer</th><th className="p-3">Job</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Balance</th></tr>
          </thead>
          <tbody>
            {list.map((i) => {
              const late = i.status === "SENT" && i.dueDate && i.dueDate < now;
              return (
                <tr key={i.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="p-3"><Link className="link" href={`/admin/invoices/${i.id}`}>{invoiceNumber(i.id)}</Link></td>
                  <td className="p-3">{i.customer.name}</td>
                  <td className="p-3">{i.title}</td>
                  <td className={`p-3 ${late ? "font-medium text-red-700" : ""}`}>{i.dueDate ? formatDate(i.dueDate, s.timezone) : ""}{late ? " (late)" : ""}</td>
                  <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs ${DOC_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span></td>
                  <td className="p-3 text-right">{formatMoney(i.totalCents)}</td>
                  <td className="p-3 text-right">{i.status === "VOID" ? "" : formatMoney(amountDueCents(i))}</td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={7} className="p-3 text-stone-500">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
