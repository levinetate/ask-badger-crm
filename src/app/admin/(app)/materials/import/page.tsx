import Link from "next/link";
import ImportForm from "./ImportForm";

export default function ImportPage() {
  return (
    <div className="max-w-5xl space-y-4">
      <Link href="/admin/materials" className="link text-sm">← Materials</Link>
      <h1 className="text-2xl font-semibold">Import a receipt</h1>
      <div className="card space-y-2 text-sm text-stone-700">
        <p>Upload a purchase history CSV to update your costs and add what you bought to stock.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Home Depot:</strong> sign in to your Pro account, open Purchase History (Purchase Tracking), pick the date range, and export to CSV.</li>
          <li><strong>Lowe&apos;s:</strong> sign in to MyLowe&apos;s Pro, open Purchases, and download the list as CSV.</li>
        </ul>
        <p className="text-stone-500">Menu names change from time to time. Any CSV with item description, quantity, and price columns works.</p>
      </div>
      <ImportForm />
    </div>
  );
}
