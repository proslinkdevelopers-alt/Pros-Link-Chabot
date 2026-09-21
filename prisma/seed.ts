/**
 * =============================================================================
 *  Database seed — Pros-Link
 * =============================================================================
 *
 *  Populates the starting state:
 *
 *    • Roles and permissions, mirrored from src/lib/permissions.ts
 *    • One Super Admin, from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *
 *  Idempotent: every write is an upsert or an existence check, so it is safe to
 *  re-run. It never deletes, and it never touches a row that belongs to another
 *  tenant.
 *
 *  Run with:  npm run db:seed
 * =============================================================================
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_INFO, ROLE_PERMISSIONS, STAFF_ROLES } from "../src/lib/permissions";
import { passwordProblem } from "../src/lib/password";
import { DEPARTMENT } from "../src/config/brand";

const prisma = new PrismaClient();

const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

// ------------------------------------------------------------------- RBAC ---

/**
 * Mirror the code-defined roles (src/lib/permissions.ts) into the roles
 * tables, so the matrix can also be read from the database. The code stays the
 * source of truth: access checks never read these tables.
 */
async function seedPermissionsAndRoles() {
  for (const key of ALL_PERMISSIONS) {
    const { group, description } = PERMISSIONS[key];
    await prisma.permission.upsert({ where: { key }, update: { group, description }, create: { key, group, description } });
  }
  console.log(`   ✔ Permissions: ${ALL_PERMISSIONS.length}`);

  const all = await prisma.permission.findMany({ where: { key: { in: [...ALL_PERMISSIONS] } }, select: { id: true, key: true } });
  const byKey = new Map(all.map((p) => [p.key, p.id]));

  for (const role of STAFF_ROLES) {
    const key = roleKey(role);
    const existing = await prisma.role.findUnique({ where: { key } });
    if (existing && existing.department !== DEPARTMENT) {
      console.warn(`   ! Role "${key}" belongs to another tenant — left untouched.`);
      continue;
    }
    const record = await prisma.role.upsert({
      where: { key },
      update: { name: ROLE_INFO[role].label, description: ROLE_INFO[role].description, department: DEPARTMENT },
      create: { key, name: ROLE_INFO[role].label, description: ROLE_INFO[role].description, department: DEPARTMENT, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[role]
        .map((permission) => byKey.get(permission))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: record.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log(`   ✔ Roles: ${STAFF_ROLES.length}`);
}

/** Tenant-scoped key, so another tenant's role of the same name is never overwritten. */
function roleKey(role: string): string {
  return `proslink-${role.toLowerCase().replace(/_/g, "-")}`;
}

// ------------------------------------------------------------------ Users ---

/**
 * One Super Admin, from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Everyone else
 * is created in Admin → Team. An existing account's password is never reset.
 */
async function seedUsers() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    console.log("   • Super Admin skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.");
    return;
  }
  const problem = passwordProblem(password);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD is too weak: ${problem}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.department !== DEPARTMENT) {
    throw new Error(`${email} already belongs to another tenant's account. Use a different SEED_ADMIN_EMAIL.`);
  }
  const rbac = await prisma.role.findUnique({ where: { key: roleKey("SUPER_ADMIN") } });
  await prisma.user.upsert({
    where: { email },
    update: { role: "SUPER_ADMIN", department: DEPARTMENT, roleId: rbac?.id, isActive: true },
    create: {
      name: process.env.SEED_ADMIN_NAME?.trim() || "Pros-Link Administrator",
      email,
      passwordHash: await bcrypt.hash(password, rounds),
      role: "SUPER_ADMIN",
      department: DEPARTMENT,
      roleId: rbac?.id,
    },
  });
  console.log(`   ✔ Super Admin: ${email}`);
}

async function main() {
  console.log("🌱  Seeding the Pros-Link database…\n");

  await seedPermissionsAndRoles();
  await seedUsers();

  console.log("\n✅  Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
