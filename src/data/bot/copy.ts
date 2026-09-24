import type { BotConfig } from "@/lib/bot/schema";

/**
 * =============================================================================
 *  Pros-Link Assistant — fixed messages
 * =============================================================================
 *
 *  Defaults only. Every value here can be changed from Admin → Chatbot Studio,
 *  and a changed section is what the assistant uses from then on.
 *
 *  Placeholders are filled at send time: {name}, {company}, {service}, {team},
 *  {reference}, {phone}, {whatsapp}, {email}, {website}, {hours}, {nextOpen},
 *  {category}, {type}, {status}, {updated}, {next}, {machine}. Text inside
 *  [[ … ]] is dropped when a placeholder in it has no value, so
 *  "Thanks[[, {name}]]!" reads "Thanks!" before the name is known.
 *
 *  Formatting: *bold* and _italic_ (WhatsApp); the web assistant renders the
 *  same marks. Emojis are deliberate and few.
 * =============================================================================
 */

/**
 * No business hours were supplied, so none are set. The assistant then never
 * tells a customer the team is closed; enter real hours in Chatbot Studio to
 * switch on the "back at…" message and business-hours follow-ups.
 */
export const DEFAULT_BUSINESS_HOURS: BotConfig["businessHours"] = null;

export const DEFAULT_MESSAGES: BotConfig["messages"] = {
  welcome: {
    en: "Welcome to Pros-Link 👋\n\nI'm the Pros-Link Assistant. I can help you find office equipment, request a quote, arrange technical support, submit a service request, or connect you with our team.\n\nHow can I help you today?",
    ur_roman:
      "Pros-Link mein khush aamdeed 👋\n\nMain Pros-Link Assistant hoon. Main office equipment dhoondne, quotation lene, technical support ya service request darj karne, ya hamari team se rabta karwane mein aap ki madad kar sakta hoon.\n\nAaj main aap ki kya madad kar sakta hoon?",
    ur: "پروس لنک میں خوش آمدید 👋\n\nمیں پروس لنک اسسٹنٹ ہوں۔ میں آفس ایکوپمنٹ ڈھونڈنے، کوٹیشن لینے، تکنیکی مدد یا سروس کی درخواست درج کرنے، یا ہماری ٹیم سے رابطہ کروانے میں آپ کی مدد کر سکتا ہوں۔\n\nآج میں آپ کی کیا مدد کر سکتا ہوں؟",
  },
  menuButton: { en: "View options", ur_roman: "Options dekhein", ur: "آپشنز دیکھیں" },
  moreOptions: { en: "More options", ur_roman: "Mazeed options", ur: "مزید آپشنز" },
  mainMenu: { en: "Main Menu", ur_roman: "Main Menu", ur: "مین مینو" },
  skip: { en: "Skip", ur_roman: "Skip karein", ur: "چھوڑ دیں" },
  footer: {
    en: "Type *menu* anytime for the main menu",
    ur_roman: "Main menu ke liye kabhi bhi *menu* likhein",
    ur: "مین مینو کے لیے کبھی بھی *menu* لکھیں",
  },
  optOut: {
    en: "Done — you won't receive promotional messages from us any more. ✅\n\nIf you need anything, just message here. Send *start* to receive updates again.",
    ur_roman:
      "Theek hai — ab aap ko hamari taraf se promotional messages nahi aayenge. ✅\n\nKabhi zaroorat ho to yahin message kar dein. Dobara updates ke liye *start* likhein.",
    ur: "ٹھیک ہے — اب آپ کو ہماری طرف سے پروموشنل پیغامات نہیں آئیں گے۔ ✅\n\nکبھی ضرورت ہو تو یہیں پیغام کر دیں۔ دوبارہ اپڈیٹس کے لیے *start* لکھیں۔",
  },
  optIn: {
    en: "Welcome back! 👋 You'll receive our updates again.",
    ur_roman: "Wapsi par khush aamdeed! 👋 Ab aap ko hamari updates dobara milengi.",
    ur: "واپسی پر خوش آمدید! 👋 اب آپ کو ہماری اپڈیٹس دوبارہ ملیں گی۔",
  },
  media: {
    en: "📎 Thanks — our team can see this in your conversation. I can't open files myself, so please tell me in a message what you need.",
    ur_roman:
      "📎 Shukriya — hamari team ise aap ki conversation mein dekh sakti hai. Main file khud nahi khol sakta, is liye message mein bata dein aap ko kya chahiye.",
    ur: "📎 شکریہ — ہماری ٹیم اسے آپ کی گفتگو میں دیکھ سکتی ہے۔ میں فائل خود نہیں کھول سکتا، اس لیے پیغام میں بتا دیں کہ آپ کو کیا چاہیے۔",
  },
  mediaAttached: {
    en: "📎 Got it — I've attached that for our team.",
    ur_roman: "📎 Mil gaya — maine ye hamari team ke liye attach kar diya hai.",
    ur: "📎 مل گیا — میں نے یہ ہماری ٹیم کے لیے منسلک کر دیا ہے۔",
  },
  nameConfirm: {
    en: "Shall I note your name as *{name}*?",
    ur_roman: "Kya main aap ka naam *{name}* likh loon?",
    ur: "کیا میں آپ کا نام *{name}* لکھ لوں؟",
  },
  nameConfirmYes: { en: "Yes, that's me", ur_roman: "Jee haan", ur: "جی ہاں" },
  nameConfirmOther: { en: "Another name", ur_roman: "Doosra naam", ur: "دوسرا نام" },
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
  handover: {
    en: "👤 I've passed your conversation to our *{team}* team with everything you've shared, so you won't need to repeat yourself.[[\n\nReference: *{reference}*]]\nThey'll reply right here.",
    ur_roman:
      "👤 Maine aap ki conversation hamari *{team}* team ko sari details ke saath bhej di hai, taake aap ko kuch dohrana na pare.[[\n\nReference: *{reference}*]]\nWoh yahin reply karenge.",
    ur: "👤 میں نے آپ کی گفتگو تمام تفصیلات کے ساتھ ہماری *{team}* ٹیم کو بھیج دی ہے، تاکہ آپ کو کچھ دہرانا نہ پڑے۔[[\n\nریفرنس: *{reference}*]]\nوہ یہیں جواب دیں گے۔",
  },
  handoverOffHours: {
    en: "Our team is away right now — they're back {nextOpen}, and your message will be first in their queue.",
    ur_roman: "Hamari team is waqt maujood nahi — woh {nextOpen} wapas hongi aur sab se pehle aap ka message dekhegi.",
    ur: "ہماری ٹیم اس وقت موجود نہیں — وہ {nextOpen} واپس ہوگی اور سب سے پہلے آپ کا پیغام دیکھے گی۔",
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
    en: "🏢 It sounds like a corporate or bulk requirement. Our team handling corporate orders has been told and will get in touch.\n\nYou can share your requirements now so they have everything ready.",
    ur_roman:
      "🏢 Lagta hai ye corporate ya bulk requirement hai. Corporate orders dekhne wali hamari team ko bata diya gaya hai aur woh rabta karegi.\n\nAap abhi apni requirements share kar dein taake unke paas sab kuch tayyar ho.",
    ur: "🏢 لگتا ہے یہ کارپوریٹ یا بڑی مقدار کی ضرورت ہے۔ کارپوریٹ آرڈرز دیکھنے والی ہماری ٹیم کو بتا دیا گیا ہے اور وہ رابطہ کرے گی۔\n\nآپ ابھی اپنی ضروریات بتا دیں تاکہ ان کے پاس سب کچھ تیار ہو۔",
  },
  pricingUnavailable: {
    en: "Prices depend on the model, quantity and your requirement, so our team prepares a quotation for {service} rather than quoting a fixed rate here. Share a few details and they'll come back to you with the price.",
    ur_roman:
      "Qeemat model, quantity aur aap ki zaroorat par depend karti hai, is liye hamari team {service} ke liye yahan fixed rate batane ki bajaye quotation tayyar karti hai. Thori details share karein, woh aap ko qeemat bata denge.",
    ur: "قیمت ماڈل، مقدار اور آپ کی ضرورت پر منحصر ہے، اس لیے ہماری ٹیم یہاں مقررہ ریٹ بتانے کے بجائے {service} کے لیے کوٹیشن تیار کرتی ہے۔ کچھ تفصیلات بتائیں، وہ آپ کو قیمت بتا دیں گے۔",
  },
  proofEmpty: {
    en: "Our team is happy to share references relevant to your business on a call.",
    ur_roman: "Hamari team call par aap ke business se mutaliq references share kar sakti hai.",
    ur: "ہماری ٹیم کال پر آپ کے کاروبار سے متعلق حوالہ جات بتا سکتی ہے۔",
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
    en: "📋 *Your requirement*\n{brief}",
    ur_roman: "📋 *Aap ki requirement*\n{brief}",
    ur: "📋 *آپ کی ضرورت*\n{brief}",
  },
  catalogIntro: {
    en: "🖨️ Which products would you like to see?",
    ur_roman: "🖨️ Aap kaunsi products dekhna chahenge?",
    ur: "🖨️ آپ کون سی پروڈکٹس دیکھنا چاہیں گے؟",
  },
  categoryIntro: {
    en: "*{category}* — tap a product for details, or request a quote.",
    ur_roman: "*{category}* — details ke liye product chunein, ya quotation mangwayein.",
    ur: "*{category}* — تفصیل کے لیے پروڈکٹ چنیں، یا کوٹیشن منگوائیں۔",
  },
  categoryEmpty: {
    en: "[[*{category}* — ]]our team will share the current range and help you choose the right model for your office. Would you like a quotation or a call back?",
    ur_roman:
      "[[*{category}* — ]]hamari team aap ko maujooda range batayegi aur aap ke office ke liye sahi model chunne mein madad karegi. Kya aap quotation chahenge ya call back?",
    ur: "[[*{category}* — ]]ہماری ٹیم آپ کو موجودہ رینج بتائے گی اور آپ کے دفتر کے لیے درست ماڈل چننے میں مدد کرے گی۔ کیا آپ کوٹیشن چاہیں گے یا کال بیک؟",
  },
  productActions: {
    en: "Would you like a quotation, a call back, or to talk to our sales team?",
    ur_roman: "Kya aap quotation, call back, ya hamari sales team se baat karna chahenge?",
    ur: "کیا آپ کوٹیشن، کال بیک، یا ہماری سیلز ٹیم سے بات کرنا چاہیں گے؟",
  },
  contactIntro: {
    en: "☎️ *Contact Pros-Link*",
    ur_roman: "☎️ *Pros-Link se rabta*",
    ur: "☎️ *پروس لنک سے رابطہ*",
  },
  contactMissing: {
    en: "You can reach our team right here — ask for a person, or request a call back and they'll get in touch with you.",
    ur_roman: "Aap yahin hamari team se rabta kar sakte hain — kisi se baat karne ka kahein, ya call back request karein, woh aap se rabta karenge.",
    ur: "آپ یہیں ہماری ٹیم سے رابطہ کر سکتے ہیں — کسی سے بات کرنے کا کہیں، یا کال بیک کی درخواست کریں، وہ آپ سے رابطہ کریں گے۔",
  },
  trackFound: {
    en: "🔎 *{reference}*\n{type}: *{status}*\nLast updated: {updated}[[\n\n{next}]]",
    ur_roman: "🔎 *{reference}*\n{type}: *{status}*\nAakhri update: {updated}[[\n\n{next}]]",
    ur: "🔎 *{reference}*\n{type}: *{status}*\nآخری اپڈیٹ: {updated}[[\n\n{next}]]",
  },
  trackNotFound: {
    en: "I couldn't find a request[[ with the reference *{reference}*]] for your number. Please check the reference — it looks like PL-TKT-7F3K2Q9A — or ask our team to look it up.",
    ur_roman:
      "Mujhe aap ke number ke liye[[ *{reference}* reference ki]] koi request nahi mili. Reference check kar lein — ye PL-TKT-7F3K2Q9A jaisa hota hai — ya hamari team se pata karwa lein.",
    ur: "مجھے آپ کے نمبر کے لیے[[ *{reference}* ریفرنس کی]] کوئی درخواست نہیں ملی۔ ریفرنس چیک کر لیں — یہ PL-TKT-7F3K2Q9A جیسا ہوتا ہے — یا ہماری ٹیم سے معلوم کروا لیں۔",
  },
  saveFailed: {
    en: "Sorry — something went wrong while saving your request, so it hasn't been submitted yet. Send any message to try again, or tap *Talk to a Person*.",
    ur_roman:
      "Maazrat — aap ki request save karte hue masla aa gaya, is liye abhi submit nahi hui. Dobara koshish ke liye koi bhi message bhejein, ya *Talk to a Person* dabayein.",
    ur: "معذرت — آپ کی درخواست محفوظ کرتے ہوئے مسئلہ پیش آیا، اس لیے ابھی جمع نہیں ہوئی۔ دوبارہ کوشش کے لیے کوئی بھی پیغام بھیجیں، یا *Talk to a Person* دبائیں۔",
  },
  notUnderstood: {
    en: "Sorry, I didn't understand that. Please choose one of the options below.",
    ur_roman: "Maazrat, main samajh nahi saka. Neeche diye gaye options mein se ek chunein.",
    ur: "معذرت، میں سمجھ نہیں سکا۔ نیچے دیے گئے آپشنز میں سے ایک چنیں۔",
  },
  intentButtons: {
    en: "Here's how I can help — please choose an option below.",
    ur_roman: "Main is tarah madad kar sakta hoon — neeche se ek option chunein.",
    ur: "میں اس طرح مدد کر سکتا ہوں — نیچے سے ایک آپشن چنیں۔",
  },
  questionLater: {
    en: "Our team will answer that when they get in touch. For now — {question}",
    ur_roman: "Is ka jawab hamari team rabta karne par degi. Filhal — {question}",
    ur: "اس کا جواب ہماری ٹیم رابطہ کرنے پر دے گی۔ فی الحال — {question}",
  },
};
