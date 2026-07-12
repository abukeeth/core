import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { DEMO_PASSWORD } from "./demo-credentials";

/**
 * Sprint 08 — Beta Experience.
 *
 * Seeds a realistic, fully-functional demo environment using ONLY
 * existing schema/services — no new tables, no new business logic. This
 * script only creates the *structural* data a restaurant owner would
 * normally configure by hand (restaurants, menus, staff, delivery/
 * kitchen config, coupons, QR tables, a customer profile) via direct
 * Prisma, following the same convention `load-tests/seed-load-test-data.ts`
 * already established for this codebase. Order history is seeded
 * separately by `scripts/seed-beta-orders.ts`, which drives the real
 * HTTP checkout/order-status API against a running server instead of
 * writing Order rows directly — see that file for why.
 *
 * Every demo account shares one password (DEMO_PASSWORD below) for
 * memorability during a beta review. This is demo-only data for a non-
 * production database — never reuse this pattern for real credentials.
 *
 * Usage: DATABASE_URL=... pnpm --filter api run seed:beta
 */

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

async function openAllDay(restaurantId: string) {
  await prisma.restaurantHours.createMany({
    data: DAYS.map((dayOfWeek) => ({ restaurantId, dayOfWeek, opensAt: 0, closesAt: 1439, isClosed: false })),
  });
}

async function upsertUser(email: string, name: string, role: Role, restaurantId?: string, phone?: string) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, restaurantId, phone },
    create: { email, name, passwordHash, role, restaurantId, phone },
  });
}

interface MenuItemSeed {
  name: string;
  description: string;
  priceCents: number;
  variants?: { name: string; priceDeltaCents: number; isDefault?: boolean }[];
  modifierGroup?: { name: string; selectionType: "SINGLE" | "MULTIPLE"; options: { name: string; priceDeltaCents: number }[] };
  outOfStock?: boolean;
}

interface CategorySeed {
  name: string;
  items: MenuItemSeed[];
}

async function seedMenu(restaurantId: string, categories: CategorySeed[]) {
  let categorySortOrder = 0;
  for (const category of categories) {
    const cat = await prisma.menuCategory.create({
      data: { restaurantId, name: category.name, sortOrder: categorySortOrder++ },
    });
    let itemSortOrder = 0;
    for (const item of category.items) {
      const menuItem = await prisma.menuItem.create({
        data: {
          restaurantId,
          categoryId: cat.id,
          name: item.name,
          description: item.description,
          priceCents: item.priceCents,
          sortOrder: itemSortOrder++,
        },
      });

      if (item.variants) {
        await prisma.menuItemVariant.createMany({
          data: item.variants.map((v, i) => ({
            menuItemId: menuItem.id,
            name: v.name,
            priceDeltaCents: v.priceDeltaCents,
            isDefault: v.isDefault ?? i === 0,
            sortOrder: i,
          })),
        });
      }

      if (item.modifierGroup) {
        const group = await prisma.modifierGroup.create({
          data: {
            restaurantId,
            name: item.modifierGroup.name,
            selectionType: item.modifierGroup.selectionType,
            isRequired: false,
            minSelections: 0,
            maxSelections: item.modifierGroup.selectionType === "SINGLE" ? 1 : undefined,
          },
        });
        await prisma.modifierOption.createMany({
          data: item.modifierGroup.options.map((o, i) => ({
            modifierGroupId: group.id,
            name: o.name,
            priceDeltaCents: o.priceDeltaCents,
            sortOrder: i,
          })),
        });
        await prisma.menuItemModifierGroup.create({
          data: { menuItemId: menuItem.id, modifierGroupId: group.id },
        });
      }

      if (item.outOfStock) {
        await prisma.menuItemInventory.create({
          data: { menuItemId: menuItem.id, trackInventory: true, isTemporarilyOutOfStock: true },
        });
      }
    }
  }
}

interface RestaurantSeed {
  ownerEmail: string;
  ownerName: string;
  name: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  categories: CategorySeed[];
  deliveryRadiusMiles: number;
  tableCount: number;
}

async function seedRestaurant(spec: RestaurantSeed) {
  const owner = await upsertUser(spec.ownerEmail, spec.ownerName, Role.RESTAURANT_OWNER);

  const existing = await prisma.restaurant.findUnique({ where: { ownerId: owner.id } });
  const restaurant = existing
    ? await prisma.restaurant.update({
        where: { id: existing.id },
        data: { name: spec.name, description: spec.description, address: spec.address, lat: spec.lat, lng: spec.lng, phone: spec.phone, isPublished: true },
      })
    : await prisma.restaurant.create({
        data: {
          ownerId: owner.id,
          name: spec.name,
          description: spec.description,
          address: spec.address,
          lat: spec.lat,
          lng: spec.lng,
          phone: spec.phone,
          isPublished: true,
        },
      });

  await prisma.user.update({ where: { id: owner.id }, data: { restaurantId: restaurant.id } });

  await openAllDay(restaurant.id);
  await seedMenu(restaurant.id, spec.categories);

  await prisma.deliveryConfig.create({
    data: {
      restaurantId: restaurant.id,
      isDeliveryEnabled: true,
      isPickupEnabled: true,
      isDineInEnabled: true,
      deliveryRadiusMiles: spec.deliveryRadiusMiles,
      maxDeliveryDistanceMiles: spec.deliveryRadiusMiles + 2,
      minOrderCentsForDelivery: 1500,
      minOrderCentsForPickup: 0,
    },
  });

  await prisma.deliveryFeeRule.create({
    data: { restaurantId: restaurant.id, name: "Standard delivery fee", feeType: "FLAT", feeValue: 399, priority: 0 },
  });

  await prisma.kitchenCapacity.create({
    data: { restaurantId: restaurant.id, isAcceptingOrders: true, maxConcurrentOrders: 25, avgPrepTimeMinutes: 20 },
  });

  const tables = [];
  for (let i = 1; i <= spec.tableCount; i++) {
    tables.push(
      prisma.table.create({
        data: { restaurantId: restaurant.id, label: `Table ${i}`, qrToken: randomBytes(16).toString("base64url"), isActive: true },
      }),
    );
  }
  await Promise.all(tables);

  return { restaurant, owner };
}

async function main() {
  console.log("Seeding Sprint 08 beta demo environment...");

  // --- Platform Admin (separate from the ADMIN_EMAIL bootstrap account in
  // seed.ts, so real production admin credentials are never printed in any
  // committed demo guide). ---
  const admin = await upsertUser("admin@demo.ordervora.example", "Priya Shah (Platform Admin)", Role.ADMIN);
  console.log(`Admin: ${admin.email}`);

  // --- Hero restaurant: full demo depth (staff/KDS/driver logins, coupons,
  // tables, variants, modifiers, an 86'd item). San Francisco coordinates
  // so a nearby delivery address resolves within its delivery radius. ---
  const { restaurant: goldenDragon } = await seedRestaurant({
    ownerEmail: "owner@goldendragon.demo",
    ownerName: "Wei Chen",
    name: "Golden Dragon Bistro",
    description: "Family-run Chinese-American kitchen serving the neighborhood since 2019.",
    address: "488 Grant Ave, San Francisco, CA 94108",
    lat: 37.7749,
    lng: -122.4064,
    phone: "415-555-0148",
    deliveryRadiusMiles: 8,
    tableCount: 6,
    categories: [
      {
        name: "Appetizers",
        items: [
          {
            name: "Spring Rolls (4pc)",
            description: "Crispy vegetable spring rolls with sweet chili sauce.",
            priceCents: 795,
            modifierGroup: {
              name: "Extra sauce",
              selectionType: "SINGLE",
              options: [
                { name: "Sweet chili (included)", priceDeltaCents: 0 },
                { name: "Spicy mustard", priceDeltaCents: 50 },
                { name: "Peanut sauce", priceDeltaCents: 50 },
              ],
            },
          },
          { name: "Potstickers (6pc)", description: "Pan-seared pork and chive dumplings.", priceCents: 895 },
          { name: "Hot & Sour Soup", description: "Classic tofu, mushroom, and egg ribbon soup.", priceCents: 595 },
          { name: "Edamame", description: "Steamed and salted.", priceCents: 495 },
        ],
      },
      {
        name: "Noodles & Rice",
        items: [
          {
            name: "Fried Rice",
            description: "Wok-fried rice with egg, scallion, and your choice of protein.",
            priceCents: 1295,
            variants: [
              { name: "Chicken", priceDeltaCents: 0, isDefault: true },
              { name: "Shrimp", priceDeltaCents: 200 },
              { name: "Vegetable", priceDeltaCents: -100 },
            ],
          },
          { name: "Lo Mein", description: "Soft egg noodles tossed in savory garlic sauce.", priceCents: 1395 },
          { name: "Singapore Noodles", description: "Curry rice noodles with shrimp and char siu.", priceCents: 1495, outOfStock: true },
        ],
      },
      {
        name: "Entrées",
        items: [
          { name: "General Tso's Chicken", description: "Crispy chicken tossed in a sweet-spicy glaze.", priceCents: 1595 },
          { name: "Kung Pao Shrimp", description: "Wok-charred shrimp, peanuts, dried chilies.", priceCents: 1795 },
          { name: "Mapo Tofu", description: "Silken tofu in a spicy fermented bean sauce.", priceCents: 1395 },
          { name: "Beef & Broccoli", description: "Tender beef and broccoli in garlic sauce.", priceCents: 1695 },
        ],
      },
      {
        name: "Drinks",
        items: [
          { name: "Thai Iced Tea", description: "House-made, served over ice.", priceCents: 495 },
          { name: "Jasmine Tea", description: "Hot, unlimited refills.", priceCents: 295 },
          { name: "Canned Soda", description: "Coke, Diet Coke, Sprite.", priceCents: 250 },
        ],
      },
    ],
  });

  await upsertUser("staff@goldendragon.demo", "Marcus Lee (Staff)", Role.RESTAURANT_STAFF, goldenDragon.id, "415-555-0161");
  const kitchenUser = await upsertUser("kitchen@goldendragon.demo", "Kitchen Display", Role.RESTAURANT_STAFF, goldenDragon.id, "415-555-0162");
  const driverUser = await upsertUser("driver@goldendragon.demo", "Sam Rivera (Driver)", Role.RESTAURANT_STAFF, goldenDragon.id, "415-555-0163");
  console.log(`Golden Dragon Bistro: owner/staff/kitchen/driver seeded (restaurantId=${goldenDragon.id})`);
  console.log(`  kitchen user id: ${kitchenUser.id}`);
  console.log(`  driver user id:  ${driverUser.id}`);

  const now = new Date();
  const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.coupon.createMany({
    data: [
      { restaurantId: goldenDragon.id, code: "WELCOME10", type: "PERCENTAGE", value: 1000, minOrderCents: 1000, maxDiscountCents: 1000 },
      { restaurantId: goldenDragon.id, code: "FREESHIP", type: "FREE_DELIVERY", value: 0, minOrderCents: 2000 },
      { restaurantId: goldenDragon.id, code: "SUMMER22", type: "PERCENTAGE", value: 1500, expiresAt: inDays(-30), isActive: true },
    ],
  });

  // --- Second restaurant: platform breadth for the Admin overview, lighter
  // depth (no dedicated staff/driver demo logins). ---
  const { restaurant: bellaItalia } = await seedRestaurant({
    ownerEmail: "owner@bellaitalia.demo",
    ownerName: "Giulia Romano",
    name: "Bella Italia Trattoria",
    description: "Handmade pasta and wood-fired pizza in the heart of North Beach.",
    address: "1550 Stockton St, San Francisco, CA 94133",
    lat: 37.8006,
    lng: -122.4103,
    phone: "415-555-0271",
    deliveryRadiusMiles: 6,
    tableCount: 4,
    categories: [
      {
        name: "Pasta",
        items: [
          { name: "Spaghetti Carbonara", description: "Guanciale, pecorino, black pepper.", priceCents: 1895 },
          { name: "Fettuccine Alfredo", description: "Fresh cream, parmesan.", priceCents: 1695 },
          { name: "Lasagna Bolognese", description: "Slow-simmered beef ragù, béchamel.", priceCents: 1995 },
        ],
      },
      {
        name: "Pizza",
        items: [
          { name: "Margherita", description: "San Marzano tomato, fior di latte, basil.", priceCents: 1595 },
          { name: "Quattro Formaggi", description: "Mozzarella, gorgonzola, fontina, parmesan.", priceCents: 1795 },
        ],
      },
      {
        name: "Drinks",
        items: [
          { name: "San Pellegrino", description: "500ml.", priceCents: 350 },
          { name: "House Red Wine (glass)", description: "Chianti.", priceCents: 900 },
        ],
      },
    ],
  });
  console.log(`Bella Italia Trattoria seeded (restaurantId=${bellaItalia.id})`);

  // --- Third restaurant: dine-in/QR-forward, also light depth. ---
  const { restaurant: tacoFiesta } = await seedRestaurant({
    ownerEmail: "owner@tacofiesta.demo",
    ownerName: "Ana Morales",
    name: "Taco Fiesta Cantina",
    description: "Fast-casual Mexican with a scan-to-order dine-in room.",
    address: "2800 Mission St, San Francisco, CA 94110",
    lat: 37.7526,
    lng: -122.4188,
    phone: "415-555-0392",
    deliveryRadiusMiles: 5,
    tableCount: 8,
    categories: [
      {
        name: "Tacos",
        items: [
          { name: "Carne Asada Taco", description: "Grilled steak, onion, cilantro.", priceCents: 495 },
          { name: "Al Pastor Taco", description: "Marinated pork, pineapple.", priceCents: 475 },
          { name: "Veggie Taco", description: "Grilled seasonal vegetables, cotija.", priceCents: 425 },
        ],
      },
      {
        name: "Bowls & Sides",
        items: [
          { name: "Burrito Bowl", description: "Rice, beans, choice of protein, salsa.", priceCents: 1295 },
          { name: "Chips & Guacamole", description: "Made fresh daily.", priceCents: 695 },
        ],
      },
      {
        name: "Drinks",
        items: [
          { name: "Horchata", description: "House-made, served over ice.", priceCents: 450 },
          { name: "Jarritos", description: "Assorted flavors.", priceCents: 350 },
        ],
      },
    ],
  });
  console.log(`Taco Fiesta Cantina seeded (restaurantId=${tacoFiesta.id})`);

  // --- Demo customer: the account provided in the beta guide, with a
  // saved delivery address geocoded near Golden Dragon Bistro (this app
  // has no server-side geocoding call — CustomerAddress.lat/lng are
  // client-supplied, see customers.validation.ts) and a couple of
  // favorites so the account looks lived-in from first login. ---
  const customerPasswordHash = await hashPassword(DEMO_PASSWORD);
  const customer = await prisma.customer.upsert({
    where: { email: "customer@demo.ordervora.example" },
    update: {},
    create: { email: "customer@demo.ordervora.example", name: "Jordan Blake", passwordHash: customerPasswordHash, phone: "415-555-0199" },
  });
  await prisma.customerAddress.create({
    data: {
      customerId: customer.id,
      label: "Home",
      line1: "845 Kearny St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94108",
      country: "US",
      lat: 37.7955,
      lng: -122.4058,
      isDefault: true,
    },
  });
  const favoriteItems = await prisma.menuItem.findMany({ where: { restaurantId: goldenDragon.id }, take: 2 });
  await prisma.customerFavorite.createMany({
    data: favoriteItems.map((item) => ({ customerId: customer.id, restaurantId: goldenDragon.id, menuItemId: item.id })),
  });
  console.log(`Demo customer: ${customer.email}`);

  console.log("\nSprint 08 beta structural seed complete.");
  console.log(`All demo accounts share the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
