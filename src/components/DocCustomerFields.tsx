import type { Customer } from "@prisma/client";

/** Pick an existing customer, or type a new one. */
export default function DocCustomerFields({ customers, selectedId }: { customers: Customer[]; selectedId?: number | null }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">Customer</legend>
      <select className="input" name="customerId" defaultValue={selectedId ?? ""}>
        <option value="">New customer (fill in below)</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
      </select>
      {!selectedId && (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" name="name" placeholder="Name" />
          <input className="input" name="email" type="email" placeholder="Email" />
          <input className="input" name="phone" type="tel" placeholder="Phone" />
        </div>
      )}
    </fieldset>
  );
}
