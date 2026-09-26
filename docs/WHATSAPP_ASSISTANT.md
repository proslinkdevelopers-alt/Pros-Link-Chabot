# Pros-Link Assistant — website and WhatsApp

_Your Office Solutions Assistant._ One conversation engine serves the website
chat (`/chat`) and the Pros-Link WhatsApp number with the same menus, catalogue
and request flows. Everything below is configuration in
Admin ▸ Chatbot Studio and can be changed without code; defaults live in
`src/data/bot`.

Languages: English, Roman Urdu and Urdu script. The customer's language is
detected per message, and the wording is written in all three.

---

## Main menu

```
Welcome to Pros-Link
├─ Products ─────────────── categories → products → details (specs, availability, brochures)
├─ Request a Quote ──────── quote flow
├─ Installation & Support ─ New Installation · Technical Support · Maintenance · Repair ·
│                           Service Request · Parts Request · General Support
├─ Repair / Maintenance ─── Request Repair · Maintenance Visit · Track a Repair
├─ Stationery ───────────── Stationery & Papers · Toner & Consumables · Parts & Accessories · Order Supplies
├─ Talk to Sales ────────── handover to the sales team
├─ Customer Support ─────── Ask a Question · Submit a Complaint · Request Service ·
│                           Replacement Parts · Product Information · Request a Callback · Talk to Support
├─ Track My Request ─────── reference + phone → status
├─ About Pros-Link
└─ Contact Pros-Link ────── from Settings ▸ Company profile only
```

On WhatsApp the menu is an interactive list (menus longer than ten rows are
paged); on the website the same options are buttons. Free text works at every
point, including in the middle of a flow — a question is answered and the flow
resumes where it was.

## Catalogue

Categories, products and brands come from Admin ▸ Catalogue. The assistant
lists **published** products only, shows exactly the specifications,
features, availability and documents entered, and names a brand only when it is
verified and active. An empty category offers a quotation, a callback or the
sales team instead of inventing products.

## Flows and what they create

| Flow | Asks for (skipping anything already known) | Creates |
| --- | --- | --- |
| **Quote** | product category, requirements, quantity, name, company (optional), phone¹, WhatsApp¹ (optional, "same number"), email (optional), city, budget (optional), preferred contact | Lead at *Quote Requested* + quote request + customer profile. Confirms: "Thank you. Your request has been submitted to Pros-Link." |
| **Installation** | machine, brand, model, quantity, name, company, phone¹, city, address, preferred visit | Installation ticket |
| **Service / repair / maintenance / technical** | machine, issue, name, company, phone¹, city, brand, model, serial number, urgency, preferred visit, photo² | Ticket; "machine has stopped" is urgent and alerts the team at once |
| **Parts** | machine, brand, model, part or consumable, quantity, name, company, phone¹, city, photo² | Parts ticket |
| **Support** (question, complaint, callback, general) | what it is about, name, phone¹, company, email | Support ticket; complaints are raised at high priority |
| **Callback** | name, phone¹, company, topic (optional) | Lead with next action "call back" |
| **Demonstration** | product category, name, company, phone¹, city, visit / phone / WhatsApp call, day and time | Appointment (Admin ▸ Appointments) |
| **Corporate requirements** | organisation, size, industry, requirements… | Lead with a brief, handed to corporate sales |
| **Track My Request** | reference (e.g. `PL-TKT-7F3K2Q9A`), phone¹ | Status of the ticket, quote, lead or appointment — only if the phone matches the one that raised it |

¹ On WhatsApp the phone number is already known and not asked.
² Photos are asked for on WhatsApp only; a photo sent later attaches to the
latest ticket. Staff open them from the ticket or the conversation.

A request is confirmed to the customer only after it is saved. If saving fails,
the customer is told it has not been submitted and the next message retries.

## Understanding free text

Keyword detection (English, Roman Urdu, Urdu; plurals and common fault phrases
such as "paper jam", "not printing", "kharab") decides:

- the **topic** — digital duplicators, photocopiers/MFPs, printers, office
  equipment, supplies, consumables, parts, installation, maintenance, repair,
  technical support, office solutions;
- the **request** — quote, pricing, demo, callback, service request, tracking,
  billing, products, partnership, careers.

Quote, service, tracking and callback requests start their flow directly; a
reference number in a message starts tracking. A product named in a message
opens its catalogue category, a price question gets the published prices or a
quotation offer, and any other recognised topic gets its next-step buttons.
Anything else — whatever it says — gets the main menu, never a "can't help";
after two such messages in a row (Chatbot Studio ▸ Human handover) the menu's
intro also tells the customer to type *talk to a person*. A photo or document
with nothing to attach it to is acknowledged, followed by the open flow's
question or the main menu. A question
asked in the middle of a flow is left for the team and the flow carries on.

**Prices:** none are published by default, so the assistant never quotes a
price — it explains that prices depend on model, quantity and requirement and
offers a quotation. Prices added in Chatbot Studio ▸ Pricing are shown exactly
as entered.

## People and teams

- "Talk to a person" (or equivalent in Roman Urdu/Urdu) hands over to the team
  that fits the conversation, or asks which team: Sales, Corporate & Bulk
  Orders, Service & Repairs, Customer Support, Parts & Supplies, Accounts.
- Frustration or a complaint hands over straight away with a summary, so the
  customer does not repeat themselves.
- Corporate signals (a tender, many branches, a large headcount, "bulk
  order") switch to corporate mode and alert corporate sales silently.
- A handover creates a ticket reference, notifies the team in-app, and appears
  in the inbox as *waiting for the team*. When staff reply from the console,
  the assistant can be paused on that thread.

## WhatsApp specifics

- **24-hour window:** free-form replies (assistant or staff) only within 24
  hours of the customer's last message; after that only approved templates.
- **Opt-out:** "STOP" (and Roman Urdu/Urdu equivalents) stops marketing
  messages; "START" resumes. Opted-out contacts are never included in
  broadcasts. Opt-out applies to WhatsApp only.
- **Attribution:** click-to-WhatsApp ads, `ref:<code>[:campaign]` in a
  prefilled message (e.g. `https://wa.me/<number>?text=Hi%20ref:qr:expo24`),
  and replies to recent broadcasts are recorded as the lead's source.
- **Follow-ups:** with `CRON_SECRET` set and the cron scheduled, warm and hot
  leads that went quiet receive up to two follow-ups inside the 24-hour window.
- **Templates and broadcasts:** Admin ▸ WhatsApp ▸ Templates (sync from Meta,
  submit new ones) and Broadcasts (segments of Pros-Link contacts who have not
  opted out, or an uploaded list).

## Lead scoring

Points for: organisation identified, clear requirement, quantity, large order,
budget, high budget, needs it soon, corporate, asked for a call, asked for a
demonstration. Bands: cold, warm (31+), hot (61+), high priority (81+). Hot and
high-priority leads alert the team once. Weights and bands are in Chatbot
Studio ▸ Scoring.

## Chatbot Studio sections

Business hours · Teams · Published pricing · References (installations and
reviews — empty until verified entries are added) · Messages & welcome ·
Menus · Buttons · Question flows · Answer options · Intents & routing · Lead
scoring · Corporate detection · Human handover · Follow-up timing · Source
tracking · Broadcast categories. Each section is validated before it
is saved; the Simulator (website or WhatsApp) runs the live configuration
without sending or saving anything.

## Testing

- `npm test` — the engine's conversation tests (menus, catalogue, every flow,
  tracking, handover, corporate mode, pricing, opt-out, languages, failure
  handling) run without a database or network.
- Admin ▸ Chatbot Studio ▸ Simulator — manual walkthroughs with the live
  configuration.
