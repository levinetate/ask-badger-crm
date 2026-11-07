import { z } from "zod";
import { upsertCustomer } from "./booking";
import { db } from "./db";

export const lineSchema = z.object({
  kind: z.enum(["LABOR", "MATERIAL", "OTHER"]),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().finite().min(0).max(100000),
  unitPriceCents: z.number().int().min(-10_000_000).max(10_000_000), // negative allowed for discounts
  taxable: z.boolean(),
  materialId: z.number().int().positive().nullable(),
});

export const linesSchema = z.array(lineSchema).max(200);

const blank = (v: unknown) => (v === "" || v == null ? undefined : v);

export const docFormSchema = z.object({
  id: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  customerId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  name: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  appointmentId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  title: z.string().trim().max(200).default(""),
  notes: z.string().max(5000).default(""),
  jobAddress: z.string().trim().max(300).default(""),
  date: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()), // valid until / due date
  lines: z.string().transform((s) => linesSchema.parse(JSON.parse(s))),
});

export type DocForm = z.infer<typeof docFormSchema>;

/** Existing customer by id, or a new/updated one from the typed name and email. */
export async function resolveCustomer(d: DocForm): Promise<number> {
  if (d.customerId) return (await db.customer.findUniqueOrThrow({ where: { id: d.customerId } })).id;
  const email = z.email().parse(d.email);
  if (!d.name) throw new Error("Customer name is required");
  return (await upsertCustomer({ name: d.name, email, phone: d.phone, address: d.jobAddress })).id;
}
