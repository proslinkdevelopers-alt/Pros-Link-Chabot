import { BRAND } from "@/config/brand";
import type { KnowledgeSeed } from "./types";

/** Installation, maintenance, repair, technical support and parts. */
export const SERVICES: KnowledgeSeed[] = [
  {
    id: "pl-service-installation",
    kind: "SERVICE",
    category: "Services",
    question: `Does ${BRAND.name} install machines?`,
    answer: `Yes — installation is one of ${BRAND.name}'s services. Request it here: tell the assistant which machine it is, where it needs to be installed and when suits you. The request is logged as a service ticket with a reference number, and the team contacts you to arrange it.`,
    keywords: ["install", "installation", "setup", "set up", "new machine", "lagwana", "fitting"],
  },
  {
    id: "pl-service-maintenance",
    kind: "SERVICE",
    category: "Services",
    question: `Does ${BRAND.name} provide maintenance?`,
    answer: `Yes — ${BRAND.name} provides maintenance for office machines. Request a maintenance visit here with the machine type, brand, model and serial number if you have them. You'll receive a ticket reference, and the team confirms the visit with you. Terms of any maintenance arrangement are confirmed by the team.`,
    keywords: ["maintenance", "servicing", "service visit", "amc", "annual maintenance", "maintenance contract", "service contract"],
  },
  {
    id: "pl-service-repair",
    kind: "SERVICE",
    category: "Services",
    question: `Can ${BRAND.name} repair my machine?`,
    answer: `Yes — repair is one of ${BRAND.name}'s services. Tap Repair / Maintenance or describe the problem: the assistant asks for the machine type, brand, model, serial number and what is wrong, and logs a service ticket. On WhatsApp you can also send a photo of the machine or the error. A technician follows up, and you can track the ticket with its reference number.`,
    keywords: ["repair", "fix", "broken", "not working", "kharab", "error", "jam", "technician", "theek", "marammat"],
  },
  {
    id: "pl-service-technical",
    kind: "SERVICE",
    category: "Services",
    question: "Can I get technical support?",
    answer: `Yes — ${BRAND.name} offers technical support. Describe the issue and the machine, and the assistant logs a technical support ticket for the team. If the machine has stopped work completely, say so, so the request is treated as urgent.`,
    keywords: ["technical support", "tech support", "help", "settings", "driver", "configuration", "network printing"],
  },
  {
    id: "pl-service-parts",
    kind: "SERVICE",
    category: "Services",
    question: "Can I order parts, toner or consumables?",
    answer: `Yes — ${BRAND.name} supplies parts, accessories and consumables. Tap Parts Request, or tell the assistant the machine's brand and model and the part or consumable you need. The team confirms availability and price with you.`,
    keywords: ["parts", "spare parts", "toner", "ink", "cartridge", "drum", "master", "consumables", "accessories"],
  },
];
