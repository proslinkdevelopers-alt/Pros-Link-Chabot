/**
 * =============================================================================
 *  Roles and permissions — the single source of truth
 * =============================================================================
 *
 *  Six console roles, each a fixed set of permissions. Pages, API routes and
 *  row-level scoping all ask `can()`; the navigation only hides what the
 *  server would refuse anyway, so hiding a link is never the protection.
 *
 *  Code-defined on purpose: a permission set that lives in a file is reviewed,
 *  versioned and tested. The seed mirrors it into the roles tables so the
 *  matrix can also be read from the database.
 *
 *  Isomorphic — the console UI uses the same checks to decide what to show.
 * =============================================================================
 */

export const PERMISSIONS = {
  "dashboard.view": { group: "Dashboard", description: "Open the dashboard" },

  "conversations.view": { group: "Conversations", description: "Read conversations in the inbox" },
  "conversations.reply": { group: "Conversations", description: "Reply to customers and take over from the assistant" },
  "conversations.manage": { group: "Conversations", description: "Assign, tag, close and annotate conversations" },

  "leads.view": { group: "Sales", description: "View leads and the pipeline" },
  "leads.manage": { group: "Sales", description: "Create, edit, assign and move leads" },
  "quotes.view": { group: "Sales", description: "View quote requests" },
  "quotes.manage": { group: "Sales", description: "Assign, update and prepare quotations" },
  "appointments.view": { group: "Sales", description: "View demonstration and visit requests" },
  "appointments.manage": { group: "Sales", description: "Confirm and reschedule appointments" },

  "customers.view": { group: "Customers", description: "View customer profiles" },
  "customers.manage": { group: "Customers", description: "Create and edit customers and the machines they own" },

  "tickets.view": { group: "Service", description: "View every service ticket and support request" },
  "tickets.manage": { group: "Service", description: "Create, assign and update any ticket" },
  "tickets.view_assigned": { group: "Service", description: "View tickets assigned to you" },
  "tickets.update_assigned": { group: "Service", description: "Update status and add notes on tickets assigned to you" },

  "products.view": { group: "Catalogue", description: "View products, categories and brands" },
  "products.manage": { group: "Catalogue", description: "Create, edit and archive products, categories and brands" },
  "knowledge.view": { group: "Catalogue", description: "View the assistant's knowledge base" },
  "knowledge.manage": { group: "Catalogue", description: "Edit and publish knowledge" },

  "reports.view": { group: "Reports", description: "View reports and analytics" },
  "notifications.view": { group: "Notifications", description: "Receive and read notifications" },

  "whatsapp.manage": { group: "WhatsApp", description: "Manage message templates and send broadcasts" },
  "chatbot.manage": { group: "WhatsApp", description: "Configure the assistant in Chatbot Studio" },

  "team.manage": { group: "Administration", description: "Create staff accounts and change roles" },
  "settings.manage": { group: "Administration", description: "Edit the company profile and integrations" },
  "audit.view": { group: "Administration", description: "Read the audit log" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Roles that may sign in to the console. Legacy role values are excluded. */
export const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "SALES", "SUPPORT", "TECHNICIAN", "VIEWER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_INFO: Record<StaffRole, { label: string; description: string }> = {
  SUPER_ADMIN: { label: "Super Admin", description: "Full access, including the team, settings and integrations." },
  ADMIN: { label: "Admin", description: "Manages the CRM, customers, conversations, catalogue and reports." },
  SALES: { label: "Sales", description: "Works leads, customers, quote requests and sales conversations." },
  SUPPORT: { label: "Support", description: "Works service tickets, customers and support conversations." },
  TECHNICIAN: { label: "Technician", description: "Sees and updates the service tickets assigned to them." },
  VIEWER: { label: "Viewer", description: "Read-only access to the CRM and reports." },
};

const VIEW_ALL: Permission[] = [
  "dashboard.view",
  "conversations.view",
  "leads.view",
  "quotes.view",
  "appointments.view",
  "customers.view",
  "tickets.view",
  "products.view",
  "knowledge.view",
  "reports.view",
  "notifications.view",
];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((key) => key !== "team.manage" && key !== "settings.manage"),
  SALES: [
    "dashboard.view",
    "conversations.view",
    "conversations.reply",
    "conversations.manage",
    "leads.view",
    "leads.manage",
    "quotes.view",
    "quotes.manage",
    "appointments.view",
    "appointments.manage",
    "customers.view",
    "customers.manage",
    "products.view",
    "knowledge.view",
    "notifications.view",
  ],
  SUPPORT: [
    "dashboard.view",
    "conversations.view",
    "conversations.reply",
    "conversations.manage",
    "tickets.view",
    "tickets.manage",
    "customers.view",
    "customers.manage",
    "products.view",
    "knowledge.view",
    "notifications.view",
  ],
  TECHNICIAN: [
    "dashboard.view",
    "tickets.view_assigned",
    "tickets.update_assigned",
    "products.view",
    "knowledge.view",
    "notifications.view",
  ],
  VIEWER: VIEW_ALL,
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return Boolean(role && (STAFF_ROLES as readonly string[]).includes(role));
}

export function permissionsFor(role: string | null | undefined): ReadonlySet<Permission> {
  return new Set(isStaffRole(role) ? ROLE_PERMISSIONS[role] : []);
}

/** True when `role` holds `permission` — or any of them, when given a list. */
export function can(role: string | null | undefined, permission: Permission | readonly Permission[]): boolean {
  const granted = permissionsFor(role);
  return (Array.isArray(permission) ? permission : [permission]).some((key) => granted.has(key as Permission));
}

/** Roles a given role may create or assign in Admin → Team. Nobody can mint a peer above themselves. */
export function assignableRoles(role: string | null | undefined): StaffRole[] {
  if (role === "SUPER_ADMIN") return [...STAFF_ROLES];
  return [];
}
