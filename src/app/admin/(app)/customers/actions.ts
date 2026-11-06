"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300),
  notes: z.string().max(5000),
});

export async function updateCustomer(form: FormData) {
  await requireAdmin();
  const { id, ...data } = schema.parse(Object.fromEntries(form));
  await db.customer.update({ where: { id }, data: { ...data, email: data.email.toLowerCase() } });
  revalidatePath(`/admin/customers/${id}`);
}
