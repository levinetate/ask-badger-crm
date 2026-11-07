import Link from "next/link";
import Scanner from "./Scanner";

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/materials" className="link text-sm">← Materials</Link>
      <h1 className="mb-4 mt-2 text-2xl font-semibold">Scan barcode</h1>
      <Scanner />
    </div>
  );
}
