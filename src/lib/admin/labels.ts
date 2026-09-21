/**
 * Labels and orderings for the console, shared by server pages, client
 * controls and API validation. Isomorphic — no server imports.
 *
 * Enum values are storage; these are what staff read. Legacy values that rows
 * written before the migration may still carry keep a readable label.
 */

// ------------------------------------------------------------ Pipeline ---

/** The sales pipeline, in order. */
export const PIPELINE_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED", "QUOTED", "NEGOTIATION", "WON", "LOST"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Stages a lead can be set to from the console. */
export const LEAD_STAGES = [...PIPELINE_STAGES, "SPAM", "OPTED_OUT"] as const;
export type SettableLeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTE_REQUESTED: "Quote Requested",
  QUOTED: "Quoted",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
  SPAM: "Spam",
  OPTED_OUT: "Opted out",
  // Written before the migration.
  PROPOSAL_SENT: "Quoted",
  HOT: "Qualified",
  FOLLOW_UP: "Contacted",
  SUPPORT: "Support",
};

/** Where a legacy stage sits on the board. */
export function boardStage(stage: string): PipelineStage | null {
  if ((PIPELINE_STAGES as readonly string[]).includes(stage)) return stage as PipelineStage;
  return ({ PROPOSAL_SENT: "QUOTED", HOT: "QUALIFIED", FOLLOW_UP: "CONTACTED" } as Record<string, PipelineStage>)[stage] ?? null;
}

export const OPEN_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_REQUESTED", "QUOTED", "NEGOTIATION", "PROPOSAL_SENT", "HOT", "FOLLOW_UP"] as const;

// ------------------------------------------------------------- Tickets ---

export const TICKET_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "TECHNICIAN_DISPATCHED", "RESOLVED", "CLOSED"] as const;
export type TicketStatusKey = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  WAITING_CUSTOMER: "Waiting for Customer",
  TECHNICIAN_DISPATCHED: "Technician Dispatched",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const OPEN_TICKET_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "TECHNICIAN_DISPATCHED"] as const;

/** Work on machines — handled by the service team and technicians. */
export const SERVICE_CATEGORIES = ["INSTALLATION", "MAINTENANCE", "REPAIR", "TECHNICAL", "SERVICE", "PARTS"] as const;
/** Everything else customers raise — handled by customer support. */
export const SUPPORT_CATEGORIES = ["GENERAL", "COMPLAINT", "CALLBACK", "BILLING", "SALES"] as const;
export const TICKET_CATEGORIES = [...SERVICE_CATEGORIES, ...SUPPORT_CATEGORIES] as const;

export const TICKET_CATEGORY_LABEL: Record<string, string> = {
  INSTALLATION: "Installation",
  MAINTENANCE: "Maintenance",
  REPAIR: "Repair",
  TECHNICAL: "Technical support",
  SERVICE: "Service request",
  PARTS: "Parts request",
  GENERAL: "General support",
  COMPLAINT: "Complaint",
  CALLBACK: "Callback",
  BILLING: "Billing",
  SALES: "Sales question",
};

// -------------------------------------------------------------- Quotes ---

export const QUOTE_STATUSES = ["REQUESTED", "DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export const QUOTE_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  DRAFT: "Preparing",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  EXPIRED: "Expired",
};

// -------------------------------------------------------- Appointments ---

export const MEETING_STATUSES = ["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const MEETING_STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  RESCHEDULED: "Rescheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
export const MEETING_MODE_LABEL: Record<string, string> = {
  SITE_VISIT: "Site visit",
  PHONE_CALL: "Phone call",
  WHATSAPP: "WhatsApp call",
  OFFICE: "At our office",
  ZOOM: "Zoom",
  GOOGLE_MEET: "Google Meet",
};

// --------------------------------------------------------------- Shared ---

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };

export const LEAD_SOURCES = ["CHATBOT", "WHATSAPP", "WEBSITE", "PHONE", "WALK_IN", "REFERRAL", "SOCIAL", "OTHER"] as const;
export const SOURCE_LABEL: Record<string, string> = {
  CHATBOT: "Website assistant",
  WHATSAPP: "WhatsApp",
  WEBSITE: "Website form",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  SOCIAL: "Social media",
  OTHER: "Other",
};

export const CUSTOMER_STATUSES = ["PROSPECT", "ACTIVE", "INACTIVE"] as const;
export const CUSTOMER_STATUS_LABEL: Record<string, string> = { PROSPECT: "Prospect", ACTIVE: "Active customer", INACTIVE: "Inactive" };

export const PUBLISH_STATES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const PUBLISH_STATE_LABEL: Record<string, string> = { DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived" };

export const TEMPERATURE_LABEL: Record<string, string> = { COLD: "Cold", WARM: "Warm", HOT: "Hot", HIGH_PRIORITY: "High priority" };

/** Any of the maps above, for a value whose kind the caller does not know. */
export function labelFor(value: string | null | undefined): string {
  if (!value) return "—";
  return (
    STAGE_LABEL[value] ??
    TICKET_STATUS_LABEL[value] ??
    TICKET_CATEGORY_LABEL[value] ??
    QUOTE_STATUS_LABEL[value] ??
    MEETING_STATUS_LABEL[value] ??
    PRIORITY_LABEL[value] ??
    SOURCE_LABEL[value] ??
    CUSTOMER_STATUS_LABEL[value] ??
    PUBLISH_STATE_LABEL[value] ??
    value.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}
