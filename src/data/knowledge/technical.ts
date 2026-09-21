import type { KnowledgeSeed } from "./types";

/**
 * General, safety-first guidance. Model-specific procedures belong here only
 * once the team has written them; until then the assistant registers a request
 * instead of improvising repairs.
 */
export const TECHNICAL: KnowledgeSeed[] = [
  {
    id: "pl-technical-jam",
    kind: "ARTICLE",
    category: "Technical",
    question: "My machine has a paper jam or shows an error. What should I do?",
    answer: "For your safety, switch the machine off before opening it, and follow the steps shown on the machine's display or in its manual — some parts inside can be hot. If the error returns or you are unsure, register a repair request with the machine's model and the exact error message or code, and a photo if you can. A technician will follow up.",
    keywords: ["paper jam", "jam", "error", "error code", "stuck", "blinking", "warning light", "kharab"],
  },
  {
    id: "pl-technical-print-quality",
    kind: "ARTICLE",
    category: "Technical",
    question: "Prints are faded, streaky or dirty. What can I do?",
    answer: "This is often a consumable reaching the end of its life — toner, ink, a drum or a master — but it can also need a technician. Tell the assistant the machine's brand and model and what the prints look like; it can log a parts request or a service ticket for the team.",
    keywords: ["faded", "streaks", "lines", "dirty prints", "print quality", "light print", "blank pages"],
  },
];
