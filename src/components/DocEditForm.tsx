import type { Customer } from "@prisma/client";
import DocCustomerFields from "./DocCustomerFields";
import LineEditor, { type EditorMaterial } from "./LineEditor";
import type { LineInput } from "@/lib/documents";

type Props = {
  action: (form: FormData) => Promise<void>;
  sendAction: (form: FormData) => Promise<void>;
  kind: "estimate" | "invoice";
  id?: number;
  customers: Customer[];
  customerId?: number | null;
  appointmentId?: number | null;
  title?: string;
  notes?: string;
  jobAddress?: string;
  date?: string;
  lines: LineInput[];
  materials: EditorMaterial[];
  laborRateCents: number;
  taxRatePercent: number;
};

export default function DocEditForm(p: Props) {
  return (
    <form action={p.action} className="card space-y-5">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      {p.appointmentId && <input type="hidden" name="appointmentId" value={p.appointmentId} />}
      <DocCustomerFields customers={p.customers} selectedId={p.customerId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Job title</label>
          <input className="input" id="title" name="title" defaultValue={p.title} placeholder="e.g. Kitchen circuit and 4 outlets" />
        </div>
        <div>
          <label className="label" htmlFor="date">{p.kind === "estimate" ? "Valid until" : "Due date"}</label>
          <input className="input" id="date" name="date" type="date" defaultValue={p.date} />
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="jobAddress">Job address</label>
          <input className="input" id="jobAddress" name="jobAddress" defaultValue={p.jobAddress} />
        </div>
      </div>
      <LineEditor initial={p.lines} materials={p.materials} laborRateCents={p.laborRateCents} taxRatePercent={p.taxRatePercent} />
      <div>
        <label className="label" htmlFor="notes">Notes for the customer</label>
        <textarea className="input" id="notes" name="notes" rows={3} defaultValue={p.notes} placeholder="Scope, exclusions, permit notes..." />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary">Save</button>
        <button className="btn-primary" formAction={p.sendAction}>Save and email to customer</button>
      </div>
    </form>
  );
}
