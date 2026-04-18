const functions = require('firebase-functions');
const admin = require('firebase-admin');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();

// ── CONFIG ──
const BOT_TOKEN = '7683450526:AAFwa8lB5iE-gb4-utDGBYV831-jGQ0q7LY';
const HOUSEHOLD_UID = '74sXH7O3J8YEbxQlIUWMIoRnbGk2';

// ── CATEGORY MAPS (for manual Telegram messages) ──
const EXPENSE_CATS = {
  food: 'food', foods: 'food', lunch: 'food', dinner: 'food', breakfast: 'food',
  groceries: 'groceries', grocery: 'groceries', supermarket: 'groceries',
  transport: 'transport', transportation: 'transport', uber: 'transport',
  taxi: 'transport', bus: 'transport', petrol: 'transport', gas: 'transport', fuel: 'transport',
  housing: 'housing', rent: 'housing', house: 'housing',
  bills: 'bills', bill: 'bills', electricity: 'bills', water: 'bills', internet: 'bills', phone: 'bills',
  fun: 'entertainment', entertainment: 'entertainment', movie: 'entertainment',
  movies: 'entertainment', games: 'entertainment',
  health: 'health', medicine: 'health', doctor: 'health', pharmacy: 'health', medical: 'health',
  shopping: 'shopping', clothes: 'shopping', shop: 'shopping',
  education: 'education', school: 'education', course: 'education', book: 'education',
  travel: 'travel', flight: 'travel', hotel: 'travel', trip: 'travel',
  other: 'other',
};

const INCOME_CATS = {
  salary: 'salary', pay: 'salary', paycheck: 'salary',
  business: 'business', sales: 'business',
  freelance: 'freelance', gig: 'freelance', contract: 'freelance',
  investment: 'investment', stocks: 'investment', dividends: 'investment',
  gift: 'gift', gifts: 'gift',
  other: 'other',
};

// ── CATEGORY EMOJI MAP ──
const CAT_EMOJI = {
  food: '🍔', groceries: '🛒', transport: '🚗', housing: '🏠',
  bills: '💡', entertainment: '🎬', health: '💊', shopping: '🛍️',
  education: '📚', travel: '✈️', other: '📌',
  salary: '💰', business: '💼', freelance: '💻', investment: '📈',
  gift: '🎁',
};

// ── PARSE MANUAL TELEGRAM MESSAGE ──
// Accepts both orders: "70 food" OR "food 70" OR "food 70 note"
function parseMessage(text) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  let isIncome = false;

  // Strip leading + for income (can be on either the amount or category part)
  let rawParts = parts.map(p => {
    if (p.startsWith('+')) { isIncome = true; return p.slice(1); }
    return p;
  });

  // Find which part is the number and which is the category
  let amountStr, catKey, noteParts;

  const firstNum = parseFloat(rawParts[0]);
  const secondNum = parseFloat(rawParts[1]);

  if (!isNaN(firstNum) && firstNum > 0) {
    // Normal order: "70 food [note]"
    amountStr = rawParts[0];
    catKey = rawParts[1].toLowerCase();
    noteParts = rawParts.slice(2);
  } else if (!isNaN(secondNum) && secondNum > 0) {
    // Reversed order: "food 70 [note]"
    catKey = rawParts[0].toLowerCase();
    amountStr = rawParts[1];
    noteParts = rawParts.slice(2);
  } else {
    return null;
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  const note = noteParts.join(' ') || '';

  if (isIncome) {
    const category = INCOME_CATS[catKey];
    if (!category) return { error: `Unknown income category: "${catKey}"\n\nValid: salary, business, freelance, investment, gift, other` };
    return { type: 'income', amount, category, note, isIncome: true };
  } else {
    const category = EXPENSE_CATS[catKey];
    if (!category) return { error: `Unknown expense category: "${catKey}"\n\nValid: food, groceries, transport, housing, bills, fun, health, shopping, education, travel, other` };
    return { type: 'expense', amount, category, note, isIncome: false };
  }
}

// ── SEND TELEGRAM MESSAGE ──
function sendTelegramMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// ── CLOUD FUNCTION: TELEGRAM WEBHOOK (manual bot) ──
// ═══════════════════════════════════════════════════════════════
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('ExpenseFlow Telegram Bot is running ✅');
  }

  try {
    const update = req.body;
    const message = update.message || update.edited_message;
    if (!message || !message.text) return res.status(200).send('ok');

    const chatId = message.chat.id;
    const senderName = message.from.first_name || message.from.username || 'Someone';
    const text = message.text.trim();

    // Help command
    if (text === '/start' || text === '/help') {
      await sendTelegramMessage(chatId,
        `💸 *ExpenseFlow Bot*\n\nSend expenses and income directly to the app!\n\n` +
        `*Format:*\n` +
        '`amount category [note]`\n\n' +
        `*Examples:*\n` +
        `\`50 food lunch\` → 🍔 Expense $50\n` +
        `\`200 transport uber\` → 🚗 Expense $200\n` +
        `\`+3000 salary\` → 💰 Income $3000\n\n` +
        `*Expense categories:* food, groceries, transport, housing, bills, fun, health, shopping, education, travel, other\n\n` +
        `*Income categories (+):* salary, business, freelance, investment, gift, other`
      );
      return res.status(200).send('ok');
    }

    // Parse the message
    const parsed = parseMessage(text);

    if (!parsed) {
      await sendTelegramMessage(chatId,
        `❌ *Couldn't parse that.*\n\nFormat: \`amount category [note]\`\nExample: \`50 food lunch\``
      );
      return res.status(200).send('ok');
    }

    if (parsed.error) {
      await sendTelegramMessage(chatId, `❌ ${parsed.error}`);
      return res.status(200).send('ok');
    }

    // Write to Firestore
    const today = new Date().toISOString().split('T')[0];
    const emoji = CAT_EMOJI[parsed.category] || '📌';
    const catName = parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1);

    await db.collection('users').doc(HOUSEHOLD_UID).collection('transactions').add({
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.note || '',
      date: today,
      addedBy: `${senderName} (Telegram)`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Confirm to user
    const sign = parsed.isIncome ? '+' : '-';
    const label = parsed.isIncome ? 'Income' : 'Expense';
    const noteText = parsed.note ? ` · _${parsed.note}_` : '';
    await sendTelegramMessage(chatId,
      `${emoji} *${label} added!*\n\n` +
      `Amount: *${sign}$${parsed.amount.toFixed(2)}*\n` +
      `Category: ${catName}${noteText}\n` +
      `Date: ${today}\n\n` +
      `✅ Synced to ExpenseFlow`
    );

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).send('ok');
  }
});

// ═══════════════════════════════════════════════════════════════
// ── MERCHANT → CATEGORY MAP ──
// ═══════════════════════════════════════════════════════════════
const MERCHANT_CATEGORY_MAP = [
  { keywords: ['WALGREENS','CVS','PHARMACY','RITE AID','CLINIC','HOSPITAL','URGENT CARE','DENTAL','DOCTOR'], category: 'health' },
  { keywords: ['HEB','KROGER','WHOLE FOODS','WHOLEFDS','ALDI','PUBLIX','SAFEWAY','TRADER JOE','SPROUTS',"SAM'S CLUB",'FOOD LION','GIANT','MEIJER','WINN-DIXIE','FIESTA'], category: 'groceries' },
  { keywords: ['STARBUCKS','MCDONALD','CHIPOTLE','TACO BELL','SUBWAY','BURGER KING','DOMINO','PIZZA','RESTAURANT','CAFE','DINER','DOORDASH','UBER EATS','GRUBHUB','INSTACART','PANDA','POPEYES','KFC','PANERA','DUNKIN','SONIC','DAIRY QUEEN','FIVE GUYS','WHATABURGER','RAISING CANE'], category: 'food' },
  { keywords: ['SHELL','CHEVRON','EXXON','BP GAS','MOBIL','VALERO','MARATHON','SUNOCO','CIRCLE K','WAWA','SPEEDWAY','PILOT TRAVEL','UBER*','LYFT','PARKING','TOLLWAY','PIKE PASS','EZPASS','AMTRAK','METRO'], category: 'transport' },
  { keywords: ['WALMART','WAL-MART','TARGET','AMAZON','COSTCO','BEST BUY','HOME DEPOT','LOWES','IKEA','MACY','NORDSTROM','KOHLS','MARSHALLS','TJ MAXX','ROSS','OLD NAVY','GAP','H&M','ZARA','NIKE','ADIDAS','FOOT LOCKER','DOLLAR TREE','DOLLAR GENERAL','FIVE BELOW','ULTA','SEPHORA','PETCO','PETSMART'], category: 'shopping' },
  { keywords: ['NETFLIX','SPOTIFY','APPLE.COM','GOOGLE PLAY','YOUTUBE','HULU','DISNEY','HBO','AMAZON PRIME','PLAYSTATION','XBOX','STEAM','AMC THEATRE','REGAL','CINEMARK','TICKETMASTER'], category: 'entertainment' },
  { keywords: ['AT&T','VERIZON','T-MOBILE','TMOBILE','COMCAST','XFINITY','SPECTRUM','COX COMM','ELECTRIC','UTILITY','WATER BILL','INSURANCE','GEICO','ALLSTATE','STATE FARM','PROGRESSIVE'], category: 'bills' },
  { keywords: ['HOTEL','MARRIOTT','HILTON','HYATT','AIRBNB','EXPEDIA','BOOKING.COM','DELTA','AMERICAN AIR','UNITED AIR','SOUTHWEST','SPIRIT AIR','JETBLUE','FRONTIER'], category: 'travel' },
  { keywords: ['RENT','APARTMENT','MORTGAGE','PROPERTY MGMT'], category: 'housing' },
  { keywords: ['COURSERA','UDEMY','CHEGG','TUITION','UNIVERSITY','COLLEGE'], category: 'education' },
];

// ── BANK ALERT TEXT PARSER ──
function parseBankAlert(text) {
  if (!text) return null;
  const upper = text.toUpperCase();

  // Extract amount — matches $7.32 or $1,234.56
  const amountMatch = text.match(/\$([0-9,]+\.[0-9]{2})/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(',', ''));
  if (isNaN(amount) || amount <= 0) return null;

  // Extract merchant
  let merchant = null;
  const patterns = [
    /(?:at|@)\s+([A-Z0-9&'\-\s\.]+?)(?:\s*#\d+)?(?:\s+on\s+\w|\s*\.|$)/i,
    /(?:initiated at|purchase at|spent at|used at|charge at|charged at|transaction at)\s+([A-Z0-9&'\-\s\.]+?)(?:\s*#\d+)?(?:\s+on\s+|\.|$)/i,
    /at\s+([A-Z0-9&'\-\s\.]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      merchant = match[1].trim().toUpperCase();
      merchant = merchant.replace(/\s+ON\s+.*/i, '').replace(/\.$/, '').trim();
      if (merchant.length > 2) break;
    }
  }
  if (!merchant) return null;

  // Extract date (fall back to today)
  let date = new Date().toISOString().split('T')[0];
  const dateMatch = text.match(/(\w+ \d{1,2},?\s+\d{4})/);
  if (dateMatch) {
    const parsed = new Date(dateMatch[1]);
    if (!isNaN(parsed)) date = parsed.toISOString().split('T')[0];
  }

  // Map merchant → category
  let category = 'shopping';
  for (const rule of MERCHANT_CATEGORY_MAP) {
    if (rule.keywords.some(kw => merchant.includes(kw))) { category = rule.category; break; }
  }

  // Detect credit/refund
  const creditWords = ['REFUND','CASHBACK','CASH BACK','CREDIT','DEPOSIT','PAYMENT RECEIVED','REVERSAL'];
  const isCredit = creditWords.some(w => upper.includes(w));

  return { amount, merchant: toTitleCase(merchant), category, date, isCredit, type: isCredit ? 'income' : 'expense' };
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════
// ── CLOUD FUNCTION 2: NOTIFICATION WEBHOOK (MacroDroid) ──
// MacroDroid POSTs here when a bank notification arrives.
// ═══════════════════════════════════════════════════════════════
exports.notificationWebhook = functions.https.onRequest(async (req, res) => {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'ExpenseFlow Notification Webhook ✅' });
  }
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { text, app, title } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing notification text' });

    console.log('📲 Notification received:', { app, title, text });

    const parsed = parseBankAlert(text);
    if (!parsed) {
      console.log('⚠️ Could not parse:', text);
      await sendTelegramMessage(TELEGRAM_CHAT_ID,
        `⚠️ *Notification received but couldn't parse*\n\n_"${text.substring(0, 200)}"_\n\nAdd manually if needed.`
      );
      return res.status(200).json({ status: 'skipped', reason: 'Could not parse' });
    }

    // Skip non-transaction alerts
    const skipWords = ['PAYMENT DUE','STATEMENT','PROMOTIONAL','AVAILABLE CREDIT','PAYMENT POSTED'];
    if (skipWords.some(w => text.toUpperCase().includes(w))) {
      return res.status(200).json({ status: 'skipped', reason: 'Non-transaction notification' });
    }

    const emoji = CAT_EMOJI[parsed.category] || '📌';
    const catName = parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1);
    const appName = app ? app.split('.').pop() : 'Bank';

    const docRef = await db.collection('users').doc(HOUSEHOLD_UID).collection('transactions').add({
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.merchant,
      date: parsed.date,
      addedBy: `Auto (${toTitleCase(appName)})`,
      source: 'notification',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Saved:', docRef.id, parsed);

    await sendTelegramMessage(TELEGRAM_CHAT_ID,
      `${emoji} *Auto-logged!*\n\n` +
      `Amount: *${parsed.type === 'income' ? '+' : '-'}$${parsed.amount.toFixed(2)}*\n` +
      `Merchant: ${parsed.merchant}\n` +
      `Category: ${catName}\n` +
      `Date: ${parsed.date}\n\n` +
      `✅ Synced to ExpenseFlow`
    );

    return res.status(200).json({ status: 'success', transaction: { id: docRef.id, amount: parsed.amount, merchant: parsed.merchant, category: parsed.category, type: parsed.type } });

  } catch (err) {
    console.error('❌ notificationWebhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
