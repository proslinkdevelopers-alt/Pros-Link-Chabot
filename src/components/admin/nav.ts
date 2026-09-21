import {
  BarChart3,
  Bell,
  Bot,
  FlaskConical,
  BookOpen,
  Boxes,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Contact,
  FileText,
  FolderKanban,
  GaugeCircle,
  Images,
  LayoutDashboard,
  LifeBuoy,
  MessageCircle,
  MessagesSquare,
  Megaphone,
  Plug,
  ReceiptText,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";

/**
 * Admin console navigation.
 *
 * `permission` names the RBAC capability required. Admin and Super Admin pass
 * everything; other roles are filtered against their granted permissions.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission | Permission[];
  /** Shown as a small pill, e.g. live counts injected by the shell. */
  badgeKey?: "openTickets" | "newLeads";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard.view" },
      {
        label: "Live Conversations",
        href: "/admin/conversations",
        icon: MessagesSquare,
        permission: "conversations.view",
      },
    ],
  },
  {
    label: "WhatsApp Assistant",
    items: [
      { label: "Chatbot Studio", href: "/admin/chatbot", icon: Bot, permission: "chatbot.manage" },
      { label: "Simulator", href: "/admin/chatbot/simulator", icon: FlaskConical, permission: "chatbot.manage" },
      { label: "Chatbot Analytics", href: "/admin/chatbot/analytics", icon: BarChart3, permission: "reports.view" },
    ],
  },
  {
    label: "Clients",
    items: [
      {
        label: "Leads",
        href: "/admin/crm/leads",
        icon: Briefcase,
        permission: "leads.view",
        badgeKey: "newLeads",
      },
      {
        label: "Customers",
        href: "/admin/crm/customers",
        icon: Contact,
        permission: "customers.view",
      },
      {
        label: "Follow-ups",
        href: "/admin/crm/follow-ups",
        icon: CalendarClock,
        permission: "dashboard.view",
      },
      {
        label: "Quotations",
        href: "/admin/quotes",
        icon: ReceiptText,
        permission: "quotes.view",
      },
      { label: "Meetings", href: "/admin/meetings", icon: CalendarDays, permission: "appointments.view" },
    ],
  },
  {
    label: "Practice",
    items: [
      {
        label: "Services",
        href: "/admin/catalogue/services",
        icon: Boxes,
        permission: "settings.manage",
      },
      {
        label: "Projects",
        href: "/admin/catalogue/projects",
        icon: FolderKanban,
        permission: "customers.view",
      },
      {
        label: "Portfolio",
        href: "/admin/catalogue/portfolio",
        icon: Images,
        permission: "settings.manage",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        label: "Knowledge Base",
        href: "/admin/knowledge",
        icon: BookOpen,
        permission: "knowledge.view",
      },
      { label: "Media & Documents", href: "/admin/media", icon: FileText, permission: "knowledge.manage" },
      { label: "Events", href: "/admin/events", icon: CalendarDays, permission: "knowledge.manage" },
      { label: "AI Training", href: "/admin/ai-training", icon: Sparkles, permission: "knowledge.manage" },
    ],
  },
  {
    label: "Support & Messaging",
    items: [
      {
        label: "Support Tickets",
        href: "/admin/support/tickets",
        icon: LifeBuoy,
        permission: ["tickets.view", "tickets.view_assigned"],
        badgeKey: "openTickets",
      },
      {
        label: "WhatsApp Inbox",
        href: "/admin/messaging/whatsapp",
        icon: MessageCircle,
        permission: "conversations.view",
      },
      {
        label: "WhatsApp Templates",
        href: "/admin/messaging/templates",
        icon: Send,
        permission: "whatsapp.manage",
      },
      {
        label: "Broadcasts",
        href: "/admin/messaging/broadcasts",
        icon: Megaphone,
        permission: "whatsapp.manage",
      },
      { label: "Notifications", href: "/admin/notifications", icon: Bell, permission: "notifications.view" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports & Analytics", href: "/admin/reports", icon: GaugeCircle, permission: "reports.view" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: Users, permission: "team.manage" },
      { label: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck, permission: "team.manage" },
      { label: "Settings", href: "/admin/settings", icon: Settings, permission: "settings.manage" },
      { label: "Integrations", href: "/admin/integrations", icon: Plug, permission: "settings.manage" },
      { label: "System Logs", href: "/admin/logs", icon: ScrollText, permission: "audit.view" },
    ],
  },
];

/** Filter navigation for a role's permissions. The server enforces the same checks. */
export function visibleNav(permissions: ReadonlySet<string>): NavGroup[] {
  const granted = (permission: NavItem["permission"]) =>
    !permission || (Array.isArray(permission) ? permission : [permission]).some((key) => permissions.has(key));
  return ADMIN_NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => granted(item.permission)),
  })).filter((group) => group.items.length > 0);
}
