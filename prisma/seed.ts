/**
 * =============================================================================
 *  Database seed — BITSOL AI Assistant
 *  Designed & Developed by BITSOL MARKETING
 * =============================================================================
 *
 *  Populates a production-ready starting state for BITSOL Marketing:
 *
 *    • RBAC — permissions, roles and role/permission grants
 *    • Users — super admin plus a sales agent
 *    • Services, portfolio and reviews
 *    • The knowledge base
 *    • Settings, WhatsApp templates, announcements and events
 *
 *  Idempotent: every write is an upsert or an existence check, so it is safe to
 *  re-run after editing the catalogues in `src/data`.
 *
 *  It never deletes. A database seeded while BITSOL Institute was still part of
 *  the product keeps its Institute roles, courses and records; the app simply
 *  no longer reads them.
 *
 *  Run with:  npm run db:seed
 * =============================================================================
 */
import { PrismaClient, type Department, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import { MARKETING_SERVICES } from "../src/data/marketing/services";
import { MARKETING_KNOWLEDGE_BASE } from "../src/data/marketing/knowledge-base";

const prisma = new PrismaClient();

const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);

async function main() {
  console.log("🌱  Seeding the BITSOL AI Assistant database…\n");

  await seedPermissionsAndRoles();
  await seedUsers();
  await seedMarketing();
  await seedKnowledgeBase();
  await seedSettings();
  await seedContent();

  console.log("\n✅  Seed complete.");
}

// ------------------------------------------------------------------- RBAC ---

const PERMISSIONS: Array<{ key: string; group: string; description: string }> = [
  { key: "dashboard.view", group: "Dashboard", description: "View the admin dashboard" },
  { key: "conversations.view", group: "Conversations", description: "View live and past conversations" },
  { key: "conversations.takeover", group: "Conversations", description: "Take over a conversation from the assistant" },
  { key: "crm.leads.view", group: "CRM", description: "View leads" },
  { key: "crm.leads.manage", group: "CRM", description: "Create, edit and move leads" },
  { key: "customers.manage", group: "CRM", description: "Manage customers" },
  { key: "services.manage", group: "Catalogue", description: "Manage services" },
  { key: "portfolio.manage", group: "Catalogue", description: "Manage portfolio and reviews" },
  { key: "knowledge.view", group: "Knowledge Base", description: "View knowledge base content" },
  { key: "knowledge.manage", group: "Knowledge Base", description: "Create and edit knowledge base content" },
  { key: "knowledge.publish", group: "Knowledge Base", description: "Publish and re-index knowledge base content" },
  { key: "tickets.view", group: "Support", description: "View support tickets" },
  { key: "tickets.manage", group: "Support", description: "Assign and resolve support tickets" },
  { key: "meetings.manage", group: "Support", description: "Confirm and reschedule meetings" },
  { key: "quotes.manage", group: "Sales", description: "Create and send quotations" },
  { key: "broadcasts.send", group: "Messaging", description: "Send WhatsApp and email broadcasts" },
  { key: "reports.view", group: "Reports", description: "View reports and analytics" },
  { key: "users.manage", group: "Administration", description: "Manage users, roles and permissions" },
  { key: "settings.manage", group: "Administration", description: "Manage settings and integrations" },
  { key: "logs.view", group: "Administration", description: "View system logs" },
];

const ROLES: Array<{
  key: string;
  name: string;
  description: string;
  department: Department | null;
  permissions: string[] | "ALL";
}> = [
  {
    key: "super-admin",
    name: "Super Admin",
    description: "Unrestricted access to every module.",
    department: null,
    permissions: "ALL",
  },
  {
    key: "marketing-admin",
    name: "Marketing Admin",
    description: "Full access to BITSOL Marketing modules.",
    department: "MARKETING",
    permissions: [
      "dashboard.view", "conversations.view", "conversations.takeover",
      "crm.leads.view", "crm.leads.manage", "customers.manage",
      "services.manage", "portfolio.manage", "knowledge.view", "knowledge.manage",
      "knowledge.publish", "tickets.view", "tickets.manage", "meetings.manage",
      "quotes.manage", "broadcasts.send", "reports.view",
    ],
  },
  {
    key: "sales-agent",
    name: "Sales Agent",
    description: "Works the BITSOL Marketing lead pipeline.",
    department: "MARKETING",
    permissions: [
      "dashboard.view", "conversations.view", "crm.leads.view", "crm.leads.manage",
      "customers.manage", "meetings.manage", "quotes.manage", "tickets.view",
    ],
  },
];

async function seedPermissionsAndRoles() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { group: permission.group, description: permission.description },
      create: permission,
    });
  }
  console.log(`   ✔ Permissions: ${PERMISSIONS.length}`);

  const all = await prisma.permission.findMany({ select: { id: true, key: true } });
  const byKey = new Map(all.map((p) => [p.key, p.id]));

  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, department: role.department },
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        department: role.department,
        isSystem: true,
      },
    });

    const keys = role.permissions === "ALL" ? PERMISSIONS.map((p) => p.key) : role.permissions;
    // Replace grants wholesale so removing a permission from this file removes
    // it from the database too — the seed is the source of truth for roles.
    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: keys
        .map((key) => byKey.get(key))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: record.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log(`   ✔ Roles: ${ROLES.length}`);
}

// ------------------------------------------------------------------ Users ---

async function seedUsers() {
  const accounts = [
    {
      email: process.env.SEED_ADMIN_EMAIL ?? "admin@bitsol.local",
      password: process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe#2024",
      name: "System Administrator",
      role: "SUPER_ADMIN" as const,
      department: null,
      roleKey: "super-admin",
    },
    {
      email: "sales@bitsol.local",
      password: process.env.SEED_STAFF_PASSWORD ?? "ChangeMe#2024",
      name: "Marketing Sales Agent",
      role: "AGENT" as const,
      department: "MARKETING" as Department,
      roleKey: "sales-agent",
    },
  ];

  for (const account of accounts) {
    const rbac = await prisma.role.findUnique({ where: { key: account.roleKey } });
    await prisma.user.upsert({
      where: { email: account.email },
      update: { role: account.role, department: account.department, roleId: rbac?.id },
      create: {
        name: account.name,
        email: account.email,
        passwordHash: await bcrypt.hash(account.password, rounds),
        role: account.role,
        department: account.department,
        roleId: rbac?.id,
      },
    });
  }
  console.log(`   ✔ Users: ${accounts.length} (admin: ${accounts[0].email})`);
}

// -------------------------------------------------------------- Marketing ---

async function seedMarketing() {
  for (const [index, service] of MARKETING_SERVICES.entries()) {
    await prisma.legacyService.upsert({
      where: { slug: service.slug },
      update: {
        name: service.name,
        group: service.group,
        tagline: service.tagline,
        overview: service.overview,
        benefits: service.benefits,
        features: service.features,
        process: service.process,
        priceFrom: service.pricing.startingAt,
        priceModel: service.pricing.model,
        priceNote: service.pricing.note,
        sortOrder: index,
      },
      create: {
        slug: service.slug,
        name: service.name,
        group: service.group,
        tagline: service.tagline,
        overview: service.overview,
        benefits: service.benefits,
        features: service.features,
        process: service.process,
        priceFrom: service.pricing.startingAt,
        priceModel: service.pricing.model,
        priceNote: service.pricing.note,
        sortOrder: index,
      },
    });
  }
  console.log(`   ✔ Marketing services: ${MARKETING_SERVICES.length}`);

  // No portfolio items or reviews are seeded. The assistant shows customers
  // only verified work, which the team enters in Admin → Chatbot Studio → Proof.
}

// --------------------------------------------------------- Knowledge base ---

async function seedKnowledgeBase() {
  for (const [index, entry] of MARKETING_KNOWLEDGE_BASE.entries()) {
    const data = {
      kind: entry.kind,
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
      keywords: entry.keywords,
      state: "PUBLISHED" as const,
      indexedAt: new Date(),
      sortOrder: index,
    };
    await prisma.knowledgeArticle.upsert({
      where: { slug: entry.id },
      update: data,
      create: { slug: entry.id, ...data },
    });
  }
  console.log(`   ✔ Marketing knowledge base: ${MARKETING_KNOWLEDGE_BASE.length} entries`);
}

// --------------------------------------------------------------- Settings ---

async function seedSettings() {
  const settings: Array<{
    key: string;
    group: string;
    department: Department | null;
    value: Prisma.InputJsonValue;
    description: string;
  }> = [
    {
      key: "branding.marketing",
      group: "branding",
      department: "MARKETING",
      value: { logoUrl: "", primaryColor: "#2563EB", accentColor: "#00D9FF", surface: "#050816" },
      description: "BITSOL Marketing logo and brand colours.",
    },
    {
      key: "company.marketing",
      group: "company",
      department: "MARKETING",
      value: {
        name: "BITSOL Marketing",
        phone: "+92 312 0141581",
        email: "info@bitsolmarketing.com",
        address: "Faisalabad, Pakistan",
        hours: "Mon–Sat, 10:00 AM – 7:00 PM",
      },
      description: "Company details shown by the assistant and on the website.",
    },
    {
      key: "ai.defaults",
      group: "integrations",
      department: null,
      value: { provider: "claude", model: "claude-opus-4-8", maxTokens: 1400, thinking: false },
      description: "Default AI provider settings (env vars take precedence).",
    },
    {
      key: "chat.handoff",
      group: "general",
      department: null,
      value: { autoTicket: true, officeHoursOnly: false },
      description: "Human handoff behaviour for the assistant.",
    },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, group: setting.group, description: setting.description },
      create: setting,
    });
  }
  console.log(`   ✔ Settings: ${settings.length}`);
}

// ---------------------------------------------------------------- Content ---

async function seedContent() {
  const templates = [
    {
      key: "mk-lead-ack",
      metaName: "mk_lead_ack",
      department: "MARKETING" as Department,
      name: "Lead acknowledgement",
      body: "Hi {{1}}, thanks for contacting BITSOL Marketing. Your request {{2}} is logged and our team will call you within one working day.",
      variables: ["name", "reference"],
    },
    {
      key: "mk-meeting-confirm",
      metaName: "mk_meeting_confirm",
      department: "MARKETING" as Department,
      name: "Consultation confirmed",
      body: "Hi {{1}}, your consultation is confirmed for {{2}} at {{3}}. Reference: {{4}}.",
      variables: ["name", "date", "time", "reference"],
    },
  ];

  // Seeded as DRAFT, never APPROVED. These are starting points for wording,
  // not templates Meta has reviewed — and a broadcast refuses to send anything
  // that has not actually been approved in the WhatsApp Business Account.
  // Admin ▸ Messaging ▸ WhatsApp Templates submits them and syncs the verdict.
  for (const template of templates) {
    await prisma.whatsappTemplate.upsert({
      where: { key: template.key },
      update: { name: template.name, body: template.body, variables: template.variables },
      create: { ...template, status: "DRAFT" as const, languageCode: "en" },
    });
  }
  console.log(`   ✔ WhatsApp templates: ${templates.length} (drafts — submit them to Meta to use)`);

  const announcements = [
    {
      department: "MARKETING" as Department,
      title: "AI automation packages now available",
      body: "Bundle an AI chatbot with WhatsApp automation and save on the combined build. Ask the assistant for a quote.",
    },
  ];

  for (const announcement of announcements) {
    const exists = await prisma.legacyAnnouncement.findFirst({ where: { title: announcement.title } });
    if (!exists) await prisma.legacyAnnouncement.create({ data: announcement });
  }
  console.log(`   ✔ Announcements: ${announcements.length}`);

  const eventStart = new Date();
  eventStart.setDate(eventStart.getDate() + 14);
  eventStart.setHours(15, 0, 0, 0);

  const events = [
    {
      slug: "ai-for-business-workshop",
      department: "MARKETING" as Department,
      title: "Workshop: AI automation for local businesses",
      summary:
        "A hands-on workshop for business owners on automating customer replies, follow-ups and reporting.",
      location: "Online",
      startsAt: new Date(eventStart.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const event of events) {
    await prisma.legacyEvent.upsert({
      where: { slug: event.slug },
      update: { title: event.title, summary: event.summary, startsAt: event.startsAt },
      create: event,
    });
  }
  console.log(`   ✔ Events: ${events.length}`);
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
