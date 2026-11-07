import Link from "next/link";
import MaterialForm from "@/components/MaterialForm";
import { getSettings } from "@/lib/db";

type Props = { searchParams: Promise<{ name?: string; barcode?: string; store?: string; category?: string; cost?: string; sku?: string }> };

export default async function NewMaterialPage({ searchParams }: Props) {
  const prefill = await searchParams;
  const s = await getSettings();
  return (
    <div className="max-w-3xl">
      <Link href="/admin/materials" className="link text-sm">← Materials</Link>
      <h1 className="mb-4 mt-2 text-2xl font-semibold">Add material</h1>
      <MaterialForm prefill={prefill} defaultMarkup={Number(s.defaultMarkupPercent)} />
    </div>
  );
}
