import {
  BarChart3,
  Bell,
  Bot,
  BookOpen,
  Boxes,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Columns3,
  FileSignature,
  FlaskConical,
  FolderTree,
  Gauge,
  Headset,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  ScrollText,
  Settings,
  Tags,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";

/**
 * Console navigation. An item shows when the signed-in role holds any of its
 * permissions — the same permissions the page and its API check on the
 * server, so hiding an item is a convenience, never the protection.
 */
export type BadgeKey = "unreadConversations" | "unreadNotifications" | "newLeads" | "newQuotes" | "openTickets" | "openSupport";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: Permission | Permission[];
  badgeKey?: BadgeKey;
  /** Match only this exact path (for parents of other items). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard.view", exact: true },
      { label: "Conversations", href: "/admin/conversations", icon: MessagesSquare, permission: "conversations.view", badgeKey: "unreadConversations" },
      { label: "Notifications", href: "/admin/notifications", icon: Bell, permission: "notifications.view", badgeKey: "unreadNotifications" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Leads", href: "/admin/leads", icon: Briefcase, permission: "leads.view", badgeKey: "newLeads" },
      { label: "Sales Pipeline", href: "/admin/pipeline", icon: Columns3, permission: "leads.view" },
      { label: "Quote Requests", href: "/admin/quotes", icon: FileSignature, permission: "quotes.view", badgeKey: "newQuotes" },
      { label: "Customers", href: "/admin/customers", icon: Users, permission: "customers.view" },
      { label: "Appointments", href: "/admin/appointments", icon: CalendarClock, permission: "appointments.view" },
    ],
  },
  {
    label: "Service",
    items: [
      { label: "Service Tickets", href: "/admin/tickets", icon: Wrench, permission: ["tickets.view", "tickets.view_assigned"], badgeKey: "openTickets" },
      { label: "Support", href: "/admin/support", icon: Headset, permission: "tickets.view", badgeKey: "openSupport" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { label: "Products", href: "/admin/products", icon: Boxes, permission: "products.view" },
      { label: "Categories", href: "/admin/categories", icon: FolderTree, permission: "products.view" },
      { label: "Brands", href: "/admin/brands", icon: Tags, permission: "products.view" },
    ],
  },
  {
    label: "Assistant",
    items: [
      { label: "Chatbot Studio", href: "/admin/chatbot", icon: Bot, permission: "chatbot.manage", exact: true },
      { label: "Knowledge Base", href: "/admin/knowledge", icon: BookOpen, permission: "knowledge.view" },
      { label: "Simulator", href: "/admin/chatbot/simulator", icon: FlaskConical, permission: "chatbot.manage" },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { label: "WhatsApp", href: "/admin/whatsapp", icon: MessageCircle, permission: "whatsapp.manage" },
      { label: "Templates", href: "/admin/messaging/templates", icon: ClipboardList, permission: "whatsapp.manage" },
      { label: "Broadcasts", href: "/admin/messaging/broadcasts", icon: Megaphone, permission: "whatsapp.manage" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: "/admin/reports", icon: BarChart3, permission: "reports.view" },
      { label: "Assistant Analytics", href: "/admin/chatbot/analytics", icon: Gauge, permission: "reports.view" },
      { label: "Audit Log", href: "/admin/audit", icon: ScrollText, permission: "audit.view" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Team", href: "/admin/team", icon: UserCog, permission: "team.manage" },
      { label: "Settings", href: "/admin/settings", icon: Settings, permission: "settings.manage" },
    ],
  },
];

export function allowed(item: Pick<NavItem, "permission">, granted: ReadonlySet<string>): boolean {
  const needs = Array.isArray(item.permission) ? item.permission : [item.permission];
  return needs.some((permission) => granted.has(permission));
}

/** The navigation a role may see. */
export function visibleNav(granted: ReadonlySet<string>): NavGroup[] {
  return ADMIN_NAV.map((group) => ({ ...group, items: group.items.filter((item) => allowed(item, granted)) })).filter(
    (group) => group.items.length > 0
  );
}

/** Every item a role may open, flat — for the command palette. */
export function flatNav(granted: ReadonlySet<string>): NavItem[] {
  return visibleNav(granted).flatMap((group) => group.items);
}
