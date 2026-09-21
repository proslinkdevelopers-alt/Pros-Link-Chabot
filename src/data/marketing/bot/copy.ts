import { BRAND } from "@/config/brand";
import type { BotConfig } from "@/lib/bot/schema";

/**
 * =============================================================================
 *  WhatsApp assistant — contact details, voice and system messages
 * =============================================================================
 *
 *  Defaults only. Every value here can be changed from Admin → Chatbot Studio,
 *  and a changed section is what the assistant uses from then on.
 *
 *  Placeholders are filled at send time: {name}, {company}, {service}, {team},
 *  {reference}, {phone}, {whatsapp}, {hours}, {nextOpen}, {website},
 *  {whatbotUrl}. Text inside [[ … ]] is dropped when a placeholder in it has no
 *  value, so "Thanks[[, {name}]]!" reads "Thanks!" before the name is known.
 *
 *  WhatsApp formatting only: *bold*, _italic_. Emojis are deliberate and few.
 * =============================================================================
 */

export const DEFAULT_CONTACT: BotConfig["contact"] = {
  whatsappCta: "",
  businessPhone: "",
  email: "",
  website: "",
  whatbotUrl: "",
  address: "",
  hours: {
    en: "Monday–Saturday, 10:00 AM – 7:00 PM (PKT)",
    ur_roman: "Somvaar se Hafta, 10:00 AM – 7:00 PM (PKT)",
    ur: "پیر تا ہفتہ، صبح 10 بجے سے شام 7 بجے تک (پاکستانی وقت)",
  },
};

export const DEFAULT_BUSINESS_HOURS: BotConfig["businessHours"] = {
  timezone: "Asia/Karachi",
  days: [1, 2, 3, 4, 5, 6],
  open: "10:00",
  close: "19:00",
};

export const DEFAULT_PERSONALITY: BotConfig["personality"] = {
  assistantName: "BITSOL Assistant",
  tone:
    "Premium, intelligent, confident and warm — a senior growth consultant at an international AI agency, not a menu bot. Results-focused, fast and concise. Use emojis sparingly: one where it helps the message scan, never a row of them.",
  instructions: [
    "Never promise guaranteed results, rankings, lead numbers or returns.",
    "Never name clients, figures, case studies or testimonials unless they appear in the knowledge you were given.",
    "Never quote a price that is not listed under Published pricing; anything else is quoted by the team after reviewing scope.",
    "BITSOL Marketing does not offer courses, classes, training programmes or admissions. If asked, say so in one line and offer the services instead.",
  ].join("\n"),
};

export const DEFAULT_MESSAGES: BotConfig["messages"] = {
  welcome: {
    en: "👋 *Welcome to BITSOL Marketing.*\n\nWe build AI-powered growth systems that help businesses generate leads, automate operations, improve customer experience, and scale.\n\nHow can we help you today? Pick an option — or just tell me what you need.",
    ur_roman:
      "👋 *BITSOL Marketing mein khush aamdeed.*\n\nHum AI-powered growth systems banate hain jo businesses ko leads generate karne, operations automate karne, customer experience behtar banane aur scale karne mein madad dete hain.\n\nAaj hum aap ki kya madad kar sakte hain? Koi option chunein — ya seedha apni zaroorat likh dein.",
    ur: "👋 *بِٹسول مارکیٹنگ میں خوش آمدید۔*\n\nہم اے آئی پر مبنی گروتھ سسٹم بناتے ہیں جو کاروباروں کو لیڈز حاصل کرنے، آپریشنز خودکار بنانے، کسٹمر کا تجربہ بہتر کرنے اور ترقی کرنے میں مدد دیتے ہیں۔\n\nآج ہم آپ کی کیا مدد کر سکتے ہیں؟ کوئی آپشن چنیں — یا سیدھا اپنی ضرورت لکھ دیں۔",
    pa: "👋 *بِٹسول مارکیٹنگ وچ جی آیاں نوں۔*\n\nاسی اے آئی گروتھ سسٹم بݨاندے آں جیہڑے کاروباراں نوں لیڈز لبھݨ، کم خودکار کرن تے اگے ودھن وچ مدد دیندے نیں۔\n\nاج اسی تہاڈی کیہ مدد کر سکدے آں؟ کوئی آپشن چُݨو — یا سِدھا اپݨی لوڑ لکھ دیو۔",
  },
  menuButton: { en: "View options", ur_roman: "Options dekhein", ur: "آپشنز دیکھیں", pa: "آپشن ویکھو" },
  moreOptions: { en: "➡️ More options", ur_roman: "➡️ Mazeed options", ur: "➡️ مزید آپشنز", pa: "➡️ ہور آپشن" },
  mainMenu: { en: "🏠 Main Menu", ur_roman: "🏠 Main Menu", ur: "🏠 مین مینو", pa: "🏠 مین مینو" },
  skip: { en: "⏭️ Skip", ur_roman: "⏭️ Skip karein", ur: "⏭️ چھوڑ دیں", pa: "⏭️ چھڈ دیو" },
  footer: {
    en: "Type *menu* anytime for the main menu",
    ur_roman: "Main menu ke liye kabhi bhi *menu* likhein",
    ur: "مین مینو کے لیے کبھی بھی *menu* لکھیں",
    pa: "مین مینو لئی کدے وی *menu* لکھو",
  },
  optOut: {
    en: "Done — you won't receive any more marketing messages from us. ✅\n\nIf you ever need us, just message here. Send *start* to talk to the assistant again.",
    ur_roman:
      "Theek hai — ab aap ko hamari taraf se marketing messages nahi aayenge. ✅\n\nKabhi zaroorat ho to yahin message kar dein. Dobara baat karne ke liye *start* likhein.",
    ur: "ٹھیک ہے — اب آپ کو ہماری طرف سے مارکیٹنگ پیغامات نہیں آئیں گے۔ ✅\n\nکبھی ضرورت ہو تو یہیں پیغام کر دیں۔ دوبارہ بات کرنے کے لیے *start* لکھیں۔",
    pa: "ٹھیک اے — ہُݨ تہانوں ساڈے ولوں مارکیٹنگ سنیہے نئیں آؤݨ گے۔ ✅\n\nکدے لوڑ ہووے تے ایتھے ای سنیہا کر دیو۔ مُڑ گل کرن لئی *start* لکھو۔",
  },
  optIn: {
    en: "Welcome back! 👋 You'll hear from us again.",
    ur_roman: "Wapsi par khush aamdeed! 👋 Ab aap ko hamari updates dobara milengi.",
    ur: "واپسی پر خوش آمدید! 👋 اب آپ کو ہماری اپڈیٹس دوبارہ ملیں گی۔",
  },
  media: {
    en: "📎 Thanks — I've attached that to your conversation for our team. I can't open files myself, so please tell me in a message what you need.",
    ur_roman:
      "📎 Shukriya — maine ye hamari team ke liye aap ki conversation se attach kar diya hai. Main file khud nahi khol sakta, is liye message mein bata dein aap ko kya chahiye.",
    ur: "📎 شکریہ — میں نے یہ ہماری ٹیم کے لیے آپ کی گفتگو سے منسلک کر دیا ہے۔ میں فائل خود نہیں کھول سکتا، اس لیے پیغام میں بتا دیں کہ آپ کو کیا چاہیے۔",
    pa: "📎 شکریہ — میں ایہہ ساڈی ٹیم لئی تہاڈی گل بات نال لا دِتا اے۔ میں فائل آپ نئیں کھول سکدا، ایس لئی سنیہے وچ دس دیو تہانوں کیہ چاہیدا اے۔",
  },
  busy: {
    en: "Sorry, I'm having trouble replying right now. Please try again in a moment — or tap *Talk to an Expert* and our team will pick this up.",
    ur_roman:
      "Maazrat, abhi reply karne mein dikkat ho rahi hai. Thori der baad dobara koshish karein — ya *Expert Se Baat* chunein, hamari team sambhal legi.",
    ur: "معذرت، ابھی جواب دینے میں دشواری ہو رہی ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں — یا *ماہر سے بات* چنیں، ہماری ٹیم سنبھال لے گی۔",
    pa: "معافی، ہُݨے جواب دیݨ وچ اوکھ آ رہی اے۔ تھوڑی دیر بعد مُڑ کوشش کرو — یا *ماہر نال گل* چُݨو۔",
  },
  nameConfirm: {
    en: "Shall I note your name as *{name}*?",
    ur_roman: "Kya main aap ka naam *{name}* likh loon?",
    ur: "کیا میں آپ کا نام *{name}* لکھ لوں؟",
  },
  nameConfirmYes: { en: "✅ Yes, that's me", ur_roman: "✅ Jee haan", ur: "✅ جی ہاں" },
  nameConfirmOther: { en: "✏️ Another name", ur_roman: "✏️ Doosra naam", ur: "✏️ دوسرا نام" },
  askAgain: {
    en: "Sorry, I didn't quite catch that. {question}",
    ur_roman: "Maazrat, main samajh nahi saka. {question}",
    ur: "معذرت، میں سمجھ نہیں سکا۔ {question}",
  },
  resumeFlow: {
    en: "Coming back to where we were — {question}",
    ur_roman: "Ab wahin se aage barhte hain — {question}",
    ur: "اب وہیں سے آگے بڑھتے ہیں — {question}",
  },
  meetingSlotRetry: {
    en: "Could you give me a day and a time? For example *tomorrow at 3pm* or *Monday 11am* — and your time zone if you're outside Pakistan.",
    ur_roman:
      "Koi din aur waqt bata dein? Maslan *kal 3 baje* ya *Monday 11 baje* — aur agar aap Pakistan se bahar hain to apna time zone bhi.",
    ur: "کوئی دن اور وقت بتا دیں؟ مثلاً *کل تین بجے* یا *پیر گیارہ بجے* — اور اگر آپ پاکستان سے باہر ہیں تو اپنا ٹائم زون بھی۔",
  },
  handover: {
    en: "👨‍💻 I've passed your conversation to our *{team}* team with everything you've shared, so you won't need to repeat yourself.\n\nReference: *{reference}*\nThey'll reply right here. You can also call {phone} ({hours}).",
    ur_roman:
      "👨‍💻 Maine aap ki conversation hamari *{team}* team ko sari details ke saath bhej di hai, taake aap ko kuch dohrana na pare.\n\nReference: *{reference}*\nWoh yahin reply karenge. Aap {phone} par call bhi kar sakte hain ({hours}).",
    ur: "👨‍💻 میں نے آپ کی گفتگو تمام تفصیلات کے ساتھ ہماری *{team}* ٹیم کو بھیج دی ہے، تاکہ آپ کو کچھ دہرانا نہ پڑے۔\n\nریفرنس: *{reference}*\nوہ یہیں جواب دیں گے۔ آپ {phone} پر کال بھی کر سکتے ہیں ({hours})۔",
    pa: "👨‍💻 میں تہاڈی گل بات ساریاں تفصیلاں نال ساڈی *{team}* ٹیم نوں بھیج دِتی اے۔\n\nریفرنس: *{reference}*\nاوہ ایتھے ای جواب دیݨ گے۔ تسی {phone} تے کال وی کر سکدے او ({hours})۔",
  },
  handoverOffHours: {
    en: "Our team is offline right now — they're back {nextOpen} and this will be first in their queue.",
    ur_roman: "Hamari team is waqt offline hai — woh {nextOpen} wapas hongi aur sab se pehle aap ka message dekhegi.",
    ur: "ہماری ٹیم اس وقت آف لائن ہے — وہ {nextOpen} واپس ہوگی اور سب سے پہلے آپ کا پیغام دیکھے گی۔",
  },
  handoverExisting: {
    en: "Your request is already with our *{team}* team (reference *{reference}*) and they'll reply here. Meanwhile I'm happy to help with anything else.",
    ur_roman:
      "Aap ki request pehle hi hamari *{team}* team ke paas hai (reference *{reference}*) aur woh yahin reply karenge. Tab tak main kisi aur cheez mein madad kar sakta hoon.",
    ur: "آپ کی درخواست پہلے ہی ہماری *{team}* ٹیم کے پاس ہے (ریفرنس *{reference}*) اور وہ یہیں جواب دیں گے۔ تب تک میں کسی اور چیز میں مدد کر سکتا ہوں۔",
  },
  handoverChooseTeam: {
    en: "Who would you like to speak with?",
    ur_roman: "Aap kis team se baat karna chahenge?",
    ur: "آپ کس ٹیم سے بات کرنا چاہیں گے؟",
  },
  enterprise: {
    en: "🏢 It sounds like you're looking for an enterprise-level solution.\n\nBITSOL can help design AI, automation, CRM, marketing and digital infrastructure around your organization.\n\nLet's connect you with our enterprise team.",
    ur_roman:
      "🏢 Lagta hai aap ko enterprise-level solution chahiye.\n\nBITSOL aap ki organization ke liye AI, automation, CRM, marketing aur digital infrastructure design kar sakta hai.\n\nAaiye aap ko hamari enterprise team se milwate hain.",
    ur: "🏢 لگتا ہے آپ کو انٹرپرائز سطح کا حل درکار ہے۔\n\nبِٹسول آپ کے ادارے کے لیے اے آئی، آٹومیشن، سی آر ایم، مارکیٹنگ اور ڈیجیٹل انفراسٹرکچر ڈیزائن کر سکتا ہے۔\n\nآئیے آپ کو ہماری انٹرپرائز ٹیم سے ملواتے ہیں۔",
  },
  pricingUnavailable: {
    en: "Pricing for {service} depends on your scope, integrations and timeline, so we don't work from a fixed rate card. Share a few details and our team will prepare an exact quote for you.",
    ur_roman:
      "{service} ki pricing aap ke scope, integrations aur timeline par depend karti hai, is liye hum fixed rate card nahi dete. Thori details share karein, hamari team aap ke liye exact quote tayyar karegi.",
    ur: "{service} کی قیمت آپ کے اسکوپ، انٹیگریشنز اور ٹائم لائن پر منحصر ہے، اس لیے ہم مقررہ ریٹ کارڈ نہیں دیتے۔ کچھ تفصیلات بتائیں، ہماری ٹیم آپ کے لیے درست کوٹیشن تیار کرے گی۔",
  },
  proofEmpty: {
    en: "We'd rather show you work that's relevant to your business than generic claims. On a free strategy call our team walks you through projects and results in your industry.",
    ur_roman:
      "Hum aap ko aam dawon ki bajaye aap ke business se mutaliq kaam dikhana pasand karte hain. Free strategy call par hamari team aap ki industry ke projects aur results dikhati hai.",
    ur: "ہم آپ کو عام دعووں کے بجائے آپ کے کاروبار سے متعلق کام دکھانا پسند کرتے ہیں۔ مفت اسٹریٹجی کال پر ہماری ٹیم آپ کی انڈسٹری کے پراجیکٹس اور نتائج دکھاتی ہے۔",
  },
  lowConfidence: {
    en: "I want to make sure you get the right answer on this. Would you like me to bring in someone from our team?",
    ur_roman: "Main chahta hoon aap ko is ka bilkul sahi jawab mile. Kya main hamari team mein se kisi ko shamil kar doon?",
    ur: "میں چاہتا ہوں آپ کو اس کا بالکل درست جواب ملے۔ کیا میں ہماری ٹیم میں سے کسی کو شامل کر دوں؟",
  },
  unknownButton: {
    en: "That option isn't available any more — here's the main menu.",
    ur_roman: "Ye option ab dastiyab nahi — ye raha main menu.",
    ur: "یہ آپشن اب دستیاب نہیں — یہ رہا مین مینو۔",
  },
  brief: {
    en: "📋 *Project brief*\n{brief}",
    ur_roman: "📋 *Project brief*\n{brief}",
    ur: "📋 *پراجیکٹ بریف*\n{brief}",
  },
};
