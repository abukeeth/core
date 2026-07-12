import "dotenv/config";
import { Role, type Prisma } from "@prisma/client";
import { getStringEnv, requireEnv } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { THEME_CATALOG } from "../src/modules/sites/theme-catalog";

function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

async function seedThemeCatalog() {
  for (const theme of THEME_CATALOG) {
    await prisma.theme.upsert({
      where: { key_version: { key: theme.key, version: theme.version } },
      update: {
        styleFamily: theme.styleFamily,
        personalityVector: toJson(theme.personalityVector),
        cuisineAffinities: toJson(theme.cuisineAffinities),
        constraints: toJson(theme.constraints),
        tokens: toJson(theme.tokens),
        variants: toJson(theme.variants),
        layouts: toJson(theme.layouts),
        isActive: true,
      },
      create: {
        key: theme.key,
        version: theme.version,
        styleFamily: theme.styleFamily,
        personalityVector: toJson(theme.personalityVector),
        cuisineAffinities: toJson(theme.cuisineAffinities),
        constraints: toJson(theme.constraints),
        tokens: toJson(theme.tokens),
        variants: toJson(theme.variants),
        layouts: toJson(theme.layouts),
      },
    });
  }
  console.log(`Seeded ${THEME_CATALOG.length} themes`);
}

async function main() {
  const email = requireEnv("ADMIN_EMAIL");
  const password = requireEnv("ADMIN_PASSWORD");
  const name = getStringEnv("ADMIN_NAME", "Platform Admin");

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, role: Role.ADMIN },
  });

  console.log(`Seeded ADMIN user: ${admin.email}`);

  await seedThemeCatalog();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
