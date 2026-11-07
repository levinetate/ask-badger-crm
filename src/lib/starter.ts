import { db } from "./db";

/** Weekday 8-5 hours and common electrical services, added only where none exist yet. */
export async function loadStarterSetup() {
  await db.businessSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  if ((await db.availabilityRule.count()) === 0) {
    await db.availabilityRule.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 17 * 60 })),
    });
  }
  if ((await db.serviceType.count()) === 0) {
    await db.serviceType.createMany({
      data: [
        { name: "Service call / troubleshooting", description: "Something not working? We'll find the problem.", durationMin: 60, sortOrder: 1 },
        { name: "Estimate visit", description: "On-site look for a quote on a bigger job.", durationMin: 60, sortOrder: 2 },
        { name: "Outlet or switch install / repair", durationMin: 60, sortOrder: 3 },
        { name: "Light fixture or ceiling fan install", durationMin: 90, sortOrder: 4 },
        { name: "Panel upgrade consultation", durationMin: 60, sortOrder: 5 },
        { name: "EV charger install consultation", durationMin: 60, sortOrder: 6 },
      ],
    });
  }
}
