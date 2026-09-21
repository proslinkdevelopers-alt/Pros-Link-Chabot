import type { BotConfig } from "@/lib/bot/schema";

/**
 * =============================================================================
 *  Pros-Link Assistant — question flows
 * =============================================================================
 *
 *  A flow is a short, ordered set of questions that ends in something the team
 *  can act on: a quote request, a service ticket, a callback, an appointment.
 *
 *  They are deliberately not forms. The engine:
 *    • asks one question per message,
 *    • skips any question already answered — earlier in the chat, in another
 *      flow, or in the middle of a sentence ("I'm Ali from City School in
 *      Lahore" answers three at once),
 *    • skips what the channel already knows (the number on WhatsApp) and what
 *      it cannot do (photos on the web),
 *    • accepts free text for every question, taps being a shortcut,
 *    • answers a question the customer asks mid-flow, then carries on.
 * =============================================================================
 */

type Flows = BotConfig["flows"];
type Step = NonNullable<Flows[keyof Flows]>["steps"][number];

const NOT_SURE = { value: "Not sure", title: { en: "Not sure", ur_roman: "Pata nahi", ur: "معلوم نہیں" } };

// ------------------------------------------------------------ Shared steps --

const NAME: Step = {
  field: "name",
  kind: "text",
  ask: { en: "May I have your name?", ur_roman: "Aap ka naam kya hai?", ur: "آپ کا نام کیا ہے؟" },
};

const PHONE: Step = {
  field: "phone",
  kind: "text",
  channels: ["WEB"],
  ask: {
    en: "What's the best phone number to reach you on?",
    ur_roman: "Aap se rabte ke liye behtareen phone number kya hai?",
    ur: "آپ سے رابطے کے لیے بہترین فون نمبر کیا ہے؟",
  },
};

const WHATSAPP: Step = {
  field: "whatsapp",
  kind: "text",
  channels: ["WEB"],
  optional: true,
  ask: {
    en: "Which number do you use on WhatsApp?",
    ur_roman: "Aap WhatsApp par kaunsa number istemal karte hain?",
    ur: "آپ واٹس ایپ پر کون سا نمبر استعمال کرتے ہیں؟",
  },
  quickAnswers: [{ value: "same-number", title: { en: "Same number", ur_roman: "Wahi number", ur: "وہی نمبر" } }],
};

const EMAIL: Step = {
  field: "email",
  kind: "text",
  optional: true,
  ask: {
    en: "What's your email address? (optional)",
    ur_roman: "Aap ka email address kya hai? (optional)",
    ur: "آپ کا ای میل ایڈریس کیا ہے؟ (اختیاری)",
  },
};

const COMPANY: Step = {
  field: "company",
  kind: "text",
  optional: true,
  ask: {
    en: "What's the name of your company or organisation?",
    ur_roman: "Aap ki company ya idaray ka naam kya hai?",
    ur: "آپ کی کمپنی یا ادارے کا نام کیا ہے؟",
  },
};

const CITY: Step = {
  field: "city",
  kind: "text",
  ask: { en: "Which city are you in?", ur_roman: "Aap kis shehar mein hain?", ur: "آپ کس شہر میں ہیں؟" },
};

const ADDRESS: Step = {
  field: "address",
  kind: "text",
  ask: {
    en: "What's the address or area where our team should come?",
    ur_roman: "Hamari team ko kis address ya area mein aana hoga?",
    ur: "ہماری ٹیم کو کس پتے یا علاقے میں آنا ہوگا؟",
  },
};

const CATEGORY: Step = {
  field: "productCategory",
  kind: "choice",
  optionsFrom: "categories",
  ask: {
    en: "What product or office solution are you looking for?",
    ur_roman: "Aap kaunsa product ya office solution dhoond rahe hain?",
    ur: "آپ کون سا پروڈکٹ یا آفس سلوشن ڈھونڈ رہے ہیں؟",
  },
};

const QUOTE_REQUIREMENTS: Step = {
  field: "requirements",
  kind: "text",
  ask: {
    en: "Tell us a little about what you need — for example the model, monthly volume, colour or black-and-white, or features.",
    ur_roman: "Apni zaroorat thori si batayein — maslan model, mahana volume, colour ya black & white, ya features.",
    ur: "اپنی ضرورت تھوڑی سی بتائیں — مثلاً ماڈل، ماہانہ حجم، رنگین یا بلیک اینڈ وائٹ، یا خصوصیات۔",
  },
};

const QUANTITY: Step = {
  field: "quantity",
  kind: "choice",
  optionsFrom: "quantities",
  ask: { en: "How many do you need?", ur_roman: "Aap ko kitne chahiye?", ur: "آپ کو کتنے چاہییں؟" },
};

const BUDGET: Step = {
  field: "budget",
  kind: "choice",
  optionsFrom: "budgets",
  optional: true,
  ask: {
    en: "Do you have a budget range in mind? (optional)",
    ur_roman: "Kya aap ke zehan mein koi budget hai? (optional)",
    ur: "کیا آپ کے ذہن میں کوئی بجٹ ہے؟ (اختیاری)",
  },
};

const TIMELINE: Step = {
  field: "timeline",
  kind: "choice",
  optionsFrom: "timelines",
  ask: { en: "When do you need it?", ur_roman: "Aap ko kab tak chahiye?", ur: "آپ کو کب تک چاہیے؟" },
};

const CONTACT_METHOD: Step = {
  field: "preferredContact",
  kind: "choice",
  optionsFrom: "contactMethods",
  ask: {
    en: "How would you like us to contact you?",
    ur_roman: "Aap chahenge ke hum aap se kaise rabta karein?",
    ur: "آپ چاہیں گے کہ ہم آپ سے کیسے رابطہ کریں؟",
  },
};

const MACHINE: Step = {
  field: "machineType",
  kind: "choice",
  optionsFrom: "machines",
  ask: { en: "Which machine is it?", ur_roman: "Kaunsi machine hai?", ur: "کون سی مشین ہے؟" },
};

const MACHINE_BRAND: Step = {
  field: "machineBrand",
  kind: "text",
  ask: { en: "What brand is the machine?", ur_roman: "Machine kis brand ki hai?", ur: "مشین کس برانڈ کی ہے؟" },
  quickAnswers: [NOT_SURE],
};

const MACHINE_MODEL: Step = {
  field: "machineModel",
  kind: "text",
  ask: {
    en: "What's the model? It's usually on the front or top of the machine.",
    ur_roman: "Model kya hai? Ye aam tor par machine ke aage ya upar likha hota hai.",
    ur: "ماڈل کیا ہے؟ یہ عموماً مشین کے سامنے یا اوپر لکھا ہوتا ہے۔",
  },
  quickAnswers: [NOT_SURE],
};

const SERIAL: Step = {
  field: "serialNumber",
  kind: "text",
  optional: true,
  ask: {
    en: "Do you have the serial number? It's on a label on the machine.",
    ur_roman: "Kya aap ke paas serial number hai? Ye machine par label par hota hai.",
    ur: "کیا آپ کے پاس سیریل نمبر ہے؟ یہ مشین پر لیبل پر ہوتا ہے۔",
  },
  quickAnswers: [{ value: "Not available", title: { en: "Not available", ur_roman: "Maujood nahi", ur: "دستیاب نہیں" } }],
};

const ISSUE: Step = {
  field: "requirements",
  kind: "text",
  ask: {
    en: "What's the problem? Any error message or code on the display helps.",
    ur_roman: "Masla kya hai? Display par koi error message ya code ho to zaroor batayein.",
    ur: "مسئلہ کیا ہے؟ ڈسپلے پر کوئی ایرر میسج یا کوڈ ہو تو ضرور بتائیں۔",
  },
};

const PRIORITY: Step = {
  field: "priority",
  kind: "choice",
  ask: { en: "How urgent is it?", ur_roman: "Ye kitna urgent hai?", ur: "یہ کتنا فوری ہے؟" },
  options: [
    { value: "URGENT", title: { en: "Machine has stopped", ur_roman: "Machine band hai", ur: "مشین بند ہے" } },
    { value: "HIGH", title: { en: "Working, but faulty", ur_roman: "Chal rahi hai, masla hai", ur: "چل رہی ہے، مسئلہ ہے" } },
    { value: "NORMAL", title: { en: "Not urgent", ur_roman: "Urgent nahi", ur: "فوری نہیں" } },
  ],
};

const VISIT: Step = {
  field: "visitSlot",
  kind: "text",
  optional: true,
  ask: {
    en: "Is there a day and time that suits you for a visit? (e.g. *tomorrow morning*). Our team will confirm.",
    ur_roman: "Visit ke liye aap ko kaunsa din aur waqt munasib hai? (maslan *kal subah*). Hamari team confirm karegi.",
    ur: "وزٹ کے لیے آپ کو کون سا دن اور وقت مناسب ہے؟ (مثلاً *کل صبح*)۔ ہماری ٹیم تصدیق کرے گی۔",
  },
};

const ATTACHMENT: Step = {
  field: "attachment",
  kind: "text",
  optional: true,
  channels: ["WHATSAPP"],
  ask: {
    en: "If you can, send a photo of the machine or the error message now — or tap Skip.",
    ur_roman: "Agar ho sake to machine ya error message ki photo abhi bhej dein — ya Skip dabayein.",
    ur: "اگر ہو سکے تو مشین یا ایرر میسج کی تصویر ابھی بھیج دیں — یا چھوڑ دیں دبائیں۔",
  },
};

const TICKET_DONE_ACTIONS = ["track_request", "customer_support", "main_menu"];

// ------------------------------------------------------------------- Flows --

export const DEFAULT_FLOWS: Flows = {
  quote: {
    title: { en: "Quote request", ur_roman: "Quotation request", ur: "کوٹیشن کی درخواست" },
    intro: {
      en: "💰 Happy to prepare a quotation. A few quick questions so our sales team gets it right.",
      ur_roman: "💰 Hum quotation tayyar kar dete hain. Chand sawal, taake hamari sales team bilkul sahi quotation banaye.",
      ur: "💰 ہم کوٹیشن تیار کر دیتے ہیں۔ چند سوال، تاکہ ہماری سیلز ٹیم بالکل درست کوٹیشن بنائے۔",
    },
    intent: "QUOTE",
    team: "SALES",
    completion: "quote",
    event: "QUOTE_REQUESTED",
    nextAction: "Prepare and send the quotation",
    steps: [CATEGORY, QUOTE_REQUIREMENTS, QUANTITY, NAME, COMPANY, PHONE, WHATSAPP, EMAIL, CITY, BUDGET, CONTACT_METHOD],
    done: {
      body: {
        en: "✅ Thank you. Your request has been submitted to Pros-Link.[[\n\nReference: *{reference}*]]\n\nOur sales team will prepare your quotation and contact you.",
        ur_roman:
          "✅ Shukriya. Aap ki request Pros-Link ko bhej di gayi hai.[[\n\nReference: *{reference}*]]\n\nHamari sales team aap ki quotation tayyar kar ke aap se rabta karegi.",
        ur: "✅ شکریہ۔ آپ کی درخواست پروس لنک کو بھیج دی گئی ہے۔[[\n\nریفرنس: *{reference}*]]\n\nہماری سیلز ٹیم آپ کی کوٹیشن تیار کر کے آپ سے رابطہ کرے گی۔",
      },
      actions: ["explore_products", "track_request", "main_menu"],
    },
  },

  installation: {
    title: { en: "Installation request", ur_roman: "Installation request", ur: "انسٹالیشن کی درخواست" },
    intro: {
      en: "🧰 Let's arrange the installation. A few details for our service team.",
      ur_roman: "🧰 Aaiye installation ka intezam karte hain. Hamari service team ke liye chand details.",
      ur: "🧰 آئیے انسٹالیشن کا انتظام کرتے ہیں۔ ہماری سروس ٹیم کے لیے چند تفصیلات۔",
    },
    intent: "INSTALLATION",
    team: "SERVICE",
    completion: "ticket",
    event: "SERVICE_REQUESTED",
    nextAction: "Arrange the installation with the customer",
    steps: [MACHINE, MACHINE_BRAND, MACHINE_MODEL, QUANTITY, NAME, COMPANY, PHONE, CITY, ADDRESS, VISIT],
    done: {
      body: {
        en: "✅ Your installation request has been logged.[[\n\nTicket: *{reference}*]][[\nMachine: {machine}]]\n\nOur service team will contact you to arrange it. You can check progress anytime with *Track My Request*.",
        ur_roman:
          "✅ Aap ki installation request darj ho gayi hai.[[\n\nTicket: *{reference}*]][[\nMachine: {machine}]]\n\nHamari service team intezam ke liye aap se rabta karegi. *Track My Request* se aap kabhi bhi status dekh sakte hain.",
        ur: "✅ آپ کی انسٹالیشن کی درخواست درج ہو گئی ہے۔[[\n\nٹکٹ: *{reference}*]][[\nمشین: {machine}]]\n\nہماری سروس ٹیم انتظام کے لیے آپ سے رابطہ کرے گی۔ *Track My Request* سے آپ کبھی بھی اسٹیٹس دیکھ سکتے ہیں۔",
      },
      actions: TICKET_DONE_ACTIONS,
    },
  },

  service: {
    title: { en: "Service request", ur_roman: "Service request", ur: "سروس کی درخواست" },
    intro: {
      en: "🔧 Sorry to hear that. Let me take a few details so our technician comes prepared.",
      ur_roman: "🔧 Afsos hua. Chand details le leta hoon taake hamara technician poori tayyari se aaye.",
      ur: "🔧 افسوس ہوا۔ چند تفصیلات لے لیتا ہوں تاکہ ہمارا ٹیکنیشن پوری تیاری سے آئے۔",
    },
    intent: "SERVICE_REQUEST",
    team: "SERVICE",
    completion: "ticket",
    event: "SERVICE_REQUESTED",
    nextAction: "Review the ticket and arrange the technician",
    steps: [MACHINE, ISSUE, NAME, COMPANY, PHONE, CITY, MACHINE_BRAND, MACHINE_MODEL, SERIAL, PRIORITY, VISIT, ATTACHMENT],
    done: {
      body: {
        en: "✅ Your service request has been logged.[[\n\nTicket: *{reference}*]][[\nMachine: {machine}]]\n\nOur service team will contact you about the next step. You can check progress anytime with *Track My Request*.",
        ur_roman:
          "✅ Aap ki service request darj ho gayi hai.[[\n\nTicket: *{reference}*]][[\nMachine: {machine}]]\n\nHamari service team agle qadam ke liye aap se rabta karegi. *Track My Request* se aap kabhi bhi status dekh sakte hain.",
        ur: "✅ آپ کی سروس کی درخواست درج ہو گئی ہے۔[[\n\nٹکٹ: *{reference}*]][[\nمشین: {machine}]]\n\nہماری سروس ٹیم اگلے قدم کے لیے آپ سے رابطہ کرے گی۔ *Track My Request* سے آپ کبھی بھی اسٹیٹس دیکھ سکتے ہیں۔",
      },
      actions: TICKET_DONE_ACTIONS,
    },
  },

  parts: {
    title: { en: "Parts request", ur_roman: "Parts request", ur: "پارٹس کی درخواست" },
    intro: {
      en: "⚙️ Let's find the right part. Which machine is it for?",
      ur_roman: "⚙️ Aaiye sahi part dhoondte hain.",
      ur: "⚙️ آئیے درست پارٹ ڈھونڈتے ہیں۔",
    },
    intent: "PARTS_ACCESSORIES",
    team: "PARTS",
    completion: "ticket",
    event: "SERVICE_REQUESTED",
    nextAction: "Confirm part availability and price with the customer",
    steps: [
      MACHINE,
      MACHINE_BRAND,
      MACHINE_MODEL,
      {
        field: "requirements",
        kind: "text",
        ask: {
          en: "Which part or consumable do you need? (e.g. toner, drum, roller)",
          ur_roman: "Aap ko kaunsa part ya consumable chahiye? (maslan toner, drum, roller)",
          ur: "آپ کو کون سا پارٹ یا کنزیومیبل چاہیے؟ (مثلاً ٹونر، ڈرم، رولر)",
        },
      },
      { ...QUANTITY, optional: true },
      NAME,
      COMPANY,
      PHONE,
      CITY,
      ATTACHMENT,
    ],
    done: {
      body: {
        en: "✅ Your parts request has been logged.[[\n\nReference: *{reference}*]]\n\nOur team will confirm availability and price with you.",
        ur_roman: "✅ Aap ki parts request darj ho gayi hai.[[\n\nReference: *{reference}*]]\n\nHamari team availability aur qeemat aap ko confirm karegi.",
        ur: "✅ آپ کی پارٹس کی درخواست درج ہو گئی ہے۔[[\n\nریفرنس: *{reference}*]]\n\nہماری ٹیم دستیابی اور قیمت کی آپ سے تصدیق کرے گی۔",
      },
      actions: TICKET_DONE_ACTIONS,
    },
  },

  support: {
    title: { en: "Support request", ur_roman: "Support request", ur: "سپورٹ کی درخواست" },
    intent: "SUPPORT",
    team: "SUPPORT",
    completion: "ticket",
    nextAction: "Review the request and reply to the customer",
    steps: [
      {
        field: "requirements",
        kind: "text",
        ask: {
          en: "Please tell me what it's about, in a sentence or two.",
          ur_roman: "Baraye meherbani ek do jumlon mein batayein ke maamla kya hai.",
          ur: "براہ کرم ایک دو جملوں میں بتائیں کہ معاملہ کیا ہے۔",
        },
      },
      NAME,
      PHONE,
      COMPANY,
      EMAIL,
    ],
    done: {
      body: {
        en: "✅ Thank you — your request has been registered.[[\n\nReference: *{reference}*]]\n\nOur team will get back to you here.",
        ur_roman: "✅ Shukriya — aap ki request darj ho gayi hai.[[\n\nReference: *{reference}*]]\n\nHamari team yahin aap se rabta karegi.",
        ur: "✅ شکریہ — آپ کی درخواست درج ہو گئی ہے۔[[\n\nریفرنس: *{reference}*]]\n\nہماری ٹیم یہیں آپ سے رابطہ کرے گی۔",
      },
      actions: TICKET_DONE_ACTIONS,
    },
  },

  callback: {
    title: { en: "Callback request", ur_roman: "Call back request", ur: "کال بیک کی درخواست" },
    intro: {
      en: "📞 Our team will call you. Just a couple of details.",
      ur_roman: "📞 Hamari team aap ko call karegi. Bas chand details.",
      ur: "📞 ہماری ٹیم آپ کو کال کرے گی۔ بس چند تفصیلات۔",
    },
    team: "SALES",
    completion: "lead",
    event: "CALL_REQUESTED",
    nextAction: "Call the customer back",
    steps: [
      NAME,
      PHONE,
      COMPANY,
      {
        field: "requirements",
        kind: "text",
        optional: true,
        ask: {
          en: "What would you like to discuss? (optional)",
          ur_roman: "Aap kis baare mein baat karna chahenge? (optional)",
          ur: "آپ کس بارے میں بات کرنا چاہیں گے؟ (اختیاری)",
        },
      },
    ],
    done: {
      body: {
        en: "✅ Thanks[[ {name}]] — our team will call you back.[[\n\nReference: *{reference}*]]",
        ur_roman: "✅ Shukriya[[ {name}]] — hamari team aap ko call back karegi.[[\n\nReference: *{reference}*]]",
        ur: "✅ شکریہ[[ {name}]] — ہماری ٹیم آپ کو کال بیک کرے گی۔[[\n\nریفرنس: *{reference}*]]",
      },
      actions: ["explore_products", "main_menu"],
    },
  },

  demo: {
    title: { en: "Demonstration request", ur_roman: "Demo request", ur: "ڈیمو کی درخواست" },
    intro: {
      en: "🎥 Let's arrange a demonstration.",
      ur_roman: "🎥 Aaiye demo ka intezam karte hain.",
      ur: "🎥 آئیے ڈیمو کا انتظام کرتے ہیں۔",
    },
    intent: "DEMO",
    team: "SALES",
    completion: "meeting",
    event: "DEMO_REQUESTED",
    nextAction: "Confirm the demonstration with the customer",
    steps: [
      CATEGORY,
      NAME,
      COMPANY,
      PHONE,
      CITY,
      {
        field: "meetingMode",
        kind: "choice",
        ask: { en: "How would you like the demonstration?", ur_roman: "Demo kis tarah chahenge?", ur: "ڈیمو کس طرح چاہیں گے؟" },
        options: [
          { value: "SITE_VISIT", title: { en: "Visit at my office", ur_roman: "Mere office mein", ur: "میرے دفتر میں" } },
          { value: "PHONE_CALL", title: { en: "Phone call", ur_roman: "Phone call", ur: "فون کال" } },
          { value: "WHATSAPP", title: { en: "WhatsApp call", ur_roman: "WhatsApp call", ur: "واٹس ایپ کال" } },
        ],
      },
      { ...VISIT, optional: false, ask: { en: "What day and time suit you? (e.g. *Tuesday 11am*). Our team will confirm.", ur_roman: "Aap ko kaunsa din aur waqt munasib hai? (maslan *Tuesday 11 baje*). Hamari team confirm karegi.", ur: "آپ کو کون سا دن اور وقت مناسب ہے؟ (مثلاً *منگل گیارہ بجے*)۔ ہماری ٹیم تصدیق کرے گی۔" } },
    ],
    done: {
      body: {
        en: "✅ Your demonstration request is in.[[\n\nReference: *{reference}*]]\n\nOur team will confirm the day and time with you — it isn't booked until they do.",
        ur_roman: "✅ Aap ki demo request mil gayi hai.[[\n\nReference: *{reference}*]]\n\nHamari team din aur waqt confirm karegi — confirm hone tak booking pakki nahi.",
        ur: "✅ آپ کی ڈیمو کی درخواست موصول ہو گئی ہے۔[[\n\nریفرنس: *{reference}*]]\n\nہماری ٹیم دن اور وقت کی تصدیق کرے گی — تصدیق تک بکنگ پکی نہیں۔",
      },
      actions: ["explore_products", "main_menu"],
    },
  },

  corporate: {
    title: { en: "Corporate requirements", ur_roman: "Corporate requirements", ur: "کارپوریٹ ضروریات" },
    intro: {
      en: "🏢 Let's capture your requirements for our team handling corporate orders.",
      ur_roman: "🏢 Aaiye corporate orders dekhne wali team ke liye aap ki requirements note karte hain.",
      ur: "🏢 آئیے کارپوریٹ آرڈرز دیکھنے والی ٹیم کے لیے آپ کی ضروریات نوٹ کرتے ہیں۔",
    },
    intent: "CORPORATE",
    team: "CORPORATE",
    completion: "brief",
    escalate: true,
    nextAction: "Review the corporate requirement and contact the customer",
    steps: [
      { ...COMPANY, optional: false },
      {
        field: "companySize",
        kind: "choice",
        ask: { en: "How many locations does your organisation have?", ur_roman: "Aap ke idaray ki kitni branches hain?", ur: "آپ کے ادارے کی کتنی برانچز ہیں؟" },
        options: [
          { value: "Single office", title: { en: "Single office", ur_roman: "Ek office", ur: "ایک دفتر" } },
          { value: "2–5 branches", title: { en: "2 – 5 branches" } },
          { value: "6–20 branches", title: { en: "6 – 20 branches" } },
          { value: "More than 20 branches", title: { en: "More than 20", ur_roman: "20 se zyada", ur: "20 سے زیادہ" } },
        ],
      },
      {
        field: "businessType",
        kind: "text",
        ask: {
          en: "What kind of organisation is it? (e.g. school, bank, government department)",
          ur_roman: "Idara kis qisam ka hai? (maslan school, bank, sarkari mehkama)",
          ur: "ادارہ کس قسم کا ہے؟ (مثلاً اسکول، بینک، سرکاری محکمہ)",
        },
      },
      {
        field: "requirements",
        kind: "text",
        ask: {
          en: "What do you need? Machines, supplies, service — as much detail as you can.",
          ur_roman: "Aap ko kya chahiye? Machines, supplies, service — jitni detail ho sake.",
          ur: "آپ کو کیا چاہیے؟ مشینیں، سپلائیز، سروس — جتنی تفصیل ہو سکے۔",
        },
      },
      QUANTITY,
      TIMELINE,
      BUDGET,
      NAME,
      PHONE,
      EMAIL,
      CITY,
    ],
    done: {
      body: {
        en: "{brief}\n\n🏢 Our team handling corporate orders will review this and contact you directly.[[\n\nReference: *{reference}*]]",
        ur_roman: "{brief}\n\n🏢 Corporate orders dekhne wali hamari team ye dekh kar khud aap se rabta karegi.[[\n\nReference: *{reference}*]]",
        ur: "{brief}\n\n🏢 کارپوریٹ آرڈرز دیکھنے والی ہماری ٹیم یہ دیکھ کر خود آپ سے رابطہ کرے گی۔[[\n\nریفرنس: *{reference}*]]",
      },
      actions: ["request_callback", "main_menu"],
    },
  },

  track: {
    title: { en: "Track a request", ur_roman: "Request track", ur: "درخواست ٹریک" },
    team: "SUPPORT",
    completion: "track",
    event: "TRACK_REQUESTED",
    nextAction: "—",
    steps: [
      {
        field: "trackingReference",
        kind: "text",
        ask: {
          en: "What's your reference number? It looks like *PL-TKT-7F3K2Q9A*.",
          ur_roman: "Aap ka reference number kya hai? Ye *PL-TKT-7F3K2Q9A* jaisa hota hai.",
          ur: "آپ کا ریفرنس نمبر کیا ہے؟ یہ *PL-TKT-7F3K2Q9A* جیسا ہوتا ہے۔",
        },
      },
      {
        ...PHONE,
        ask: {
          en: "And the phone number you used when you made the request?",
          ur_roman: "Aur wo phone number jo aap ne request karte waqt diya tha?",
          ur: "اور وہ فون نمبر جو آپ نے درخواست کرتے وقت دیا تھا؟",
        },
      },
    ],
    done: { body: { en: "—" }, actions: ["track_request", "customer_support", "main_menu"] },
  },
};

// ----------------------------------------------------------------- Options --

export const DEFAULT_OPTIONS: BotConfig["options"] = {
  machines: [
    { value: "Digital duplicator", title: { en: "Digital duplicator", ur_roman: "Digital duplicator", ur: "ڈیجیٹل ڈپلیکیٹر" }, intent: "DIGITAL_DUPLICATOR" },
    { value: "Photocopier / MFP", title: { en: "Photocopier / MFP", ur_roman: "Photocopier / MFP", ur: "فوٹو کاپیئر / ایم ایف پی" }, intent: "PHOTOCOPIER" },
    { value: "Printer", title: { en: "Printer", ur_roman: "Printer", ur: "پرنٹر" }, intent: "PRINTER" },
    { value: "Other office equipment", title: { en: "Other equipment", ur_roman: "Koi aur machine", ur: "کوئی اور مشین" }, intent: "OFFICE_EQUIPMENT" },
  ],
  quantities: [
    { value: "1 unit", title: { en: "1", ur_roman: "1", ur: "1" } },
    { value: "2–5 units", title: { en: "2 – 5" } },
    { value: "6–20 units", title: { en: "6 – 20" }, highValue: true },
    { value: "More than 20 units", title: { en: "More than 20", ur_roman: "20 se zyada", ur: "20 سے زیادہ" }, highValue: true },
    { value: "Not sure", title: { en: "Not sure", ur_roman: "Pata nahi", ur: "معلوم نہیں" } },
  ],
  budgets: [
    { value: "Under Rs 250,000", title: { en: "Under Rs 250,000", ur_roman: "Rs 250,000 se kam", ur: "250,000 روپے سے کم" } },
    { value: "Rs 250,000–750,000", title: { en: "Rs 250k – 750k" } },
    { value: "Rs 750,000–2,000,000", title: { en: "Rs 750k – 2M" } },
    { value: "Above Rs 2,000,000", title: { en: "Above Rs 2M", ur_roman: "Rs 2M se zyada", ur: "20 لاکھ روپے سے زیادہ" }, highValue: true },
    { value: "Not sure", title: { en: "Not sure", ur_roman: "Pata nahi", ur: "معلوم نہیں" } },
  ],
  timelines: [
    { value: "Immediately", title: { en: "Immediately", ur_roman: "Foran", ur: "فوراً" }, immediate: true },
    { value: "Within 2 weeks", title: { en: "Within 2 weeks", ur_roman: "2 hafton mein", ur: "2 ہفتوں میں" }, immediate: true },
    { value: "Within a month", title: { en: "Within a month", ur_roman: "Ek mahine mein", ur: "ایک مہینے میں" } },
    { value: "1–3 months", title: { en: "1 – 3 months", ur_roman: "1 – 3 mahine", ur: "1 – 3 مہینے" } },
    { value: "Just exploring", title: { en: "Just exploring", ur_roman: "Sirf maloomat", ur: "صرف معلومات" } },
  ],
  contactMethods: [
    { value: "Phone call", title: { en: "Phone call", ur_roman: "Phone call", ur: "فون کال" } },
    { value: "WhatsApp", title: { en: "WhatsApp", ur_roman: "WhatsApp", ur: "واٹس ایپ" } },
    { value: "Email", title: { en: "Email", ur_roman: "Email", ur: "ای میل" } },
  ],
};
