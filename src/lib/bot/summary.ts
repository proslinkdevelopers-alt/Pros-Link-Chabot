import type { CustomerDetails } from "@/lib/ai/customer";
import type { LeadScore } from "./scoring";
import type { BotConfig } from "./schema";
import type { BotState, FlowId, TeamKey } from "./types";

/**
 * Structured write-ups: the brief a customer sees at the end of a corporate
 * enquiry, and the handover summary a person receives when a conversation is
 * passed to them — built so nobody asks the customer to repeat themselves.
 */

const TEMPERATURE_LABEL = { COLD: "Cold", WARM: "Warm", HOT: "Hot", HIGH_PRIORITY: "High Priority" } as const;

function line(label: string, value: string | undefined): string | null {
  return value ? `• *${label}:* ${value}` : null;
}

/** The machine a request is about, as one line: "Photocopier · Sindoh D311 · SN 12345". */
export function machineLine(details: CustomerDetails): string | undefined {
  // "Not sure" and "Not available" are answers for the team, not for the summary line.
  const known = (value: string | undefined) => (value && !/^(not sure|not available|pata nahi|maujood nahi)$/i.test(value.trim()) ? value : undefined);
  const model = [known(details.machineBrand), known(details.machineModel)].filter(Boolean).join(" ");
  const serial = known(details.serialNumber);
  const parts = [details.machineType, model, serial ? `SN ${serial}` : undefined].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** The customer-facing brief, in WhatsApp formatting. */
export function projectBrief(details: CustomerDetails, flow: FlowId): string {
  const lines =
    flow === "corporate"
      ? [
          line("Organisation", details.company),
          line("Size", details.companySize),
          line("Industry", details.businessType),
          line("Requirement", details.requirements),
          line("Quantity", details.quantity),
          line("Timeline", details.timeline),
          line("Budget", details.budget),
          line("City", details.city),
        ]
      : [
          line("Company", details.company),
          line("Interested in", details.interest),
          line("Requirement", details.requirements),
          line("Quantity", details.quantity),
          line("Budget", details.budget),
          line("City", details.city),
        ];
  return lines.filter(Boolean).join("\n");
}

/** The same brief as plain text, for the CRM's requirements column. */
export function plainBrief(details: CustomerDetails, flow: FlowId): string {
  return projectBrief(details, flow).replace(/\*/g, "").replace(/^• /gm, "");
}

export interface HandoverSummary {
  team: TeamKey;
  reason: string;
  text: string;
  recommendedAction: string;
}

export function recommendedAction(input: {
  reason: string;
  team: TeamKey;
  score?: LeadScore;
  enterprise?: boolean;
  service?: string;
}): string {
  const { reason, team, score, enterprise, service } = input;
  if (/upset|frustrat|complain/i.test(reason)) {
    return "Reply personally and resolve the concern. Read the transcript first so the customer does not have to explain again.";
  }
  if (enterprise || team === "CORPORATE") {
    return "Call the customer today to understand the corporate requirement and plan a proposal.";
  }
  if (team === "ACCOUNTS") return "Check the account and reply with the billing details the customer needs.";
  if (team === "SERVICE") return "Review the machine details, update the ticket and arrange the visit or next step with the customer.";
  if (team === "PARTS") return "Confirm part availability and price, then reply to the customer.";
  if (team === "SUPPORT") return "Review the request, update the ticket and reply to the customer.";
  if (score && (score.temperature === "HIGH_PRIORITY" || score.temperature === "HOT")) {
    return `Call today while interest is high${service ? ` and prepare a quotation for ${service}` : ""}.`;
  }
  return `Reply to the customer${service ? ` about ${service}` : ""} and qualify the requirement.`;
}

export function handoverSummary(input: {
  details: CustomerDetails;
  state: BotState;
  score?: LeadScore;
  phone: string;
  profileName?: string;
  team: TeamKey;
  reason: string;
  conversation: string;
  config: BotConfig;
  serviceLabel?: string;
}): HandoverSummary {
  const { details, state, score, config } = input;
  const action = recommendedAction({
    reason: input.reason,
    team: input.team,
    score,
    enterprise: state.signals.enterprise,
    service: input.serviceLabel,
  });

  const name = details.name ?? input.profileName ?? "Not shared";
  const phone = details.phone ?? (input.phone || undefined);
  const rows: Array<[string, string | undefined]> = [
    ["CUSTOMER", [name, phone, details.email].filter(Boolean).join(" · ")],
    ["COMPANY", [details.company, details.businessType, details.companySize].filter(Boolean).join(" · ") || undefined],
    ["CITY", [details.city, details.address].filter(Boolean).join(" · ") || undefined],
    ["INTENT", details.topic ?? state.intent],
    ["INTERESTED IN", input.serviceLabel ?? details.interest],
    ["MACHINE", machineLine(details)],
    ["REQUIREMENT", details.requirements],
    ["QUANTITY", details.quantity],
    ["BUDGET", details.budget],
    ["TIMELINE", details.timeline],
    ["PREFERRED CONTACT", details.preferredContact],
    ["LEAD SCORE", score ? `${score.value}/100 (${TEMPERATURE_LABEL[score.temperature]})${score.reasons.length ? ` — ${score.reasons.join(", ")}` : ""}` : undefined],
    ["TEAM", config.teams[input.team]?.label ?? input.team],
    ["WHY", input.reason],
    ["PREVIOUS SELECTIONS", state.trail?.length ? state.trail.join(" → ") : undefined],
  ];

  const text = [
    ...rows.map(([label, value]) => `${label}: ${value ?? "—"}`),
    "",
    "CONVERSATION SUMMARY:",
    input.conversation || "—",
    "",
    `RECOMMENDED ACTION: ${action}`,
  ].join("\n");

  return { team: input.team, reason: input.reason, text, recommendedAction: action };
}
