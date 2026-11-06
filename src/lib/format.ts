export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: "bg-amber-100 text-amber-900",
  CONFIRMED: "bg-green-100 text-green-900",
  CANCELLED: "bg-stone-200 text-stone-600 line-through",
  COMPLETED: "bg-sky-100 text-sky-900",
};
