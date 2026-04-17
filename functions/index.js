const functions = require('firebase-functions');
const admin = require('firebase-admin');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();

// ── CONFIG ──
const BOT_TOKEN = '7683450526:AAFwa8lB5iE-gb4-utDGBYV831-jGQ0q7LY';
const HOUSEHOLD_UID = '74sXH7O3J8YEbxQlIUWMIoRnbGk2';

// ── TELEGRAM CHAT ID ──
// This is the chat ID that receives auto-log confirmations.
// To find yours: message your bot, then visit:
// https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
// Look for "chat":{"id": XXXXXXX}
const TELEGRAM_CHAT_ID = 8508193225; // Arivu's chat ID

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

// ═══════════════════════════════════════════════════════════════
// ── MERCHANT → CATEGORY MAP (for auto bank alert parsing) ──
// ═══════════════════════════════════════════════════════════════
const MERCHANT_CATEGORY_MAP = [
  // Health & Pharmacy
  { keywords: ['WALGREENS', 'CVS', 'PHARMACY', 'RITE AID', 'DUANE READE', 'CLINIC', 'HOSPITAL', 'URGENT CARE', 'DENTAL', 'OPTOMETRIST', 'DOCTOR'], category: 'health' },
  // Groceries
  { keywords: ['HEB', 'KROGER', 'WHOLE FOODS', 'WHOLEFDS', 'ALDI', 'PUBLIX', 'SAFEWAY', 'TRADER JOE', 'SPROUTS', "SAM'S CLUB", 'BJ\'S WHOLESALE', 'FOOD LION', 'GIANT', 'MEIJER', 'WINN-DIXIE', 'FIESTA'], category: 'groceries' },
  // Food & Restaurants
  { keywords: ['STARBUCKS', 'MCDONALD', 'MCDONALDS', 'CHICK-FIL', 'CHIPOTLE', 'TACO BELL', 'SUBWAY', 'WENDY', 'BURGER KING', 'DOMINO', 'PIZZA', 'RESTAURANT', 'CAFE', 'DINER', 'DOORDASH', 'UBER EATS', 'GRUBHUB', 'INSTACART', 'NOODLES', 'PANDA', 'POPEYES', 'KFC', 'PANERA', 'OLIVE GARDEN', 'APPLEBEE', 'CHILI\'S', 'DUNKIN', 'SONIC', 'DAIRY QUEEN', 'FIVE GUYS', 'IN-N-OUT', 'RAISING CANE', 'WHATABURGER'], category: 'food' },
  // Transport & Gas
  { keywords: ['SHELL', 'CHEVRON', 'EXXON', 'BP GAS', 'MOBIL', 'VALERO', 'MARATHON', 'SUNOCO', 'CIRCLE K', 'WAWA', 'SPEEDWAY', 'PILOT TRAVEL', 'FLYING J', 'UBER*', 'LYFT', 'PARKWAY', 'PARKING', 'TOLLWAY', 'PIKE PASS', 'EZPASS', 'AMTRAK', 'GREYHOUND', 'METRO'], category: 'transport' },
  // Shopping & General Retail
  { keywords: ['WALMART', 'WAL-MART', 'TARGET', 'AMAZON', 'COSTCO', 'BEST BUY', 'BESTBUY', 'HOME DEPOT', 'LOWE\'S', 'LOWES', 'IKEA', 'MACY\'S', 'NORDSTROM', 'KOHLS', 'MARSHALLS', 'TJ MAXX', 'ROSS', 'OLD NAVY', 'GAP', 'H&M', 'ZARA', 'NIKE', 'ADIDAS', 'FOOT LOCKER', 'DOLLAR TREE', 'DOLLAR GENERAL', 'FIVE BELOW', 'BATH & BODY', 'ULTA', 'SEPHORA', 'PETCO', 'PETSMART'], category: 'shopping' },
  // Entertainment
  { keywords: ['NETFLIX', 'SPOTIFY', 'APPLE.COM', 'GOOGLE PLAY', 'YOUTUBE', 'HULU', 'DISNEY', 'HBO', 'AMAZON PRIME', 'PLAYSTATION', 'XBOX', 'STEAM', 'AMC THEATRE', 'REGAL', 'CINEMARK', 'CINEMA', 'TICKETMASTER', 'STUBHUB'], category: 'entertainment' },
  // Bills & Utilities
  { keywords: ['AT&T', 'VERIZON', 'T-MOBILE', 'TMOBILE', 'SPRINT', 'COMCAST', 'XFINITY', 'SPECTRUM', 'COX COMM', 'ELECTRIC', 'GAS BILL', 'UTILITY', 'WATER BILL', 'INSURANCE', 'GEICO', 'ALLSTATE', 'STATE FARM', 'PROGRESSIVE'], category: 'bills' },
  // Travel
  { keywords: ['HOTEL', 'MARRIOTT', 'HILTON', 'HYATT', 'IHG', 'AIRBNB', 'EXPEDIA', 'BOOKING.COM', 'DELTA', 'AMERICAN AIR', 'UNITED AIR', 'SOUTHWEST', 'SPIRIT AIR', 'JETBLUE', 'FRONTIER'], category: 'travel' },
  // Housing
  { keywords: ['RENT', 'APARTMENT', 'MORTGAGE', 'PROPERTY MGMT'], category: 'housing' },
  // Education
  { keywords: ['AMAZON EDU', 'COURSERA', 'UDEMY', 'CHEGG', 'TUITION', 'UNIVERSITY', 'COLLEGE'], category: 'education' },
];

// ═══════════════════════════════════════════════════════════════
// ── BANK ALERT TEXT PARSER ──
// Handles Discover, Chase, BOA, Citi, Capital One, etc.
// ═══════════════════════════════════════════════════════════════
function parseBankAlert(text) {
  if (!text) return null;
  const upper = text.toUpperCase();

  // ── Extract amount ──
  // Matches patterns like: $7.32 / $1,234.56
  const amountMatch = text.match(/\$([0-9,]+\.[0-9]{2})/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(',', ''));
  if (isNaN(amount) || amount <= 0) return null;

  // ── Extract merchant name ──
  // Pattern 1: "at MERCHANT NAME" or "at MERCHANT NAME #1234"
  // Pattern 2: "initiated at MERCHANT" / "purchase at MERCHANT" / "spent at MERCHANT"
  let merchant = null;

  // Most bank alerts end with:  "at MERCHANT #STORE on DATE"
  const patterns = [
    /(?:at|@)\s+([A-Z0-9&'\-\s\.]+?)(?:\s*#\d+)?(?:\s+on\s+\w|\s*\.|$)/i,
    /(?:initiated at|purchase at|spent at|used at|charge at|charged at|transaction at)\s+([A-Z0-9&'\-\s\.]+?)(?:\s*#\d+)?(?:\s+on\s+|\.|$)/i,
    /at\s+([A-Z0-9&'\-\s\.]+)/i, // fallback: everything after "at"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      merchant = match[1].trim().toUpperCase();
      // Clean up trailing noise
      merchant = merchant.replace(/\s+ON\s+.*/i, '').replace(/\.$/, '').trim();
      if (merchant.length > 2) break;
    }
  }

  if (!merchant) return null;

  // ── Extract date (optional, fall back to today) ──
  let date = new Date().toISOString().split('T')[0];
  const dateMatch = text.match(/(\w+ \d{1,2},?\s+\d{4})/);
  if (dateMatch) {
    const parsed = new Date(dateMatch[1]);
    if (!isNaN(parsed)) date = parsed.toISOString().split('T')[0];
  }

  // ── Map merchant → category ──
  let category = 'shopping'; // default
  for (const rule of MERCHANT_CATEGORY_MAP) {
    if (rule.keywords.some(kw => merchant.includes(kw))) {
      category = rule.category;
      break;
    }
  }

  // ── Detect if it's an income/credit (refund, cashback, payment, deposit) ──
  const creditWords = ['REFUND', 'CASHBACK', 'CASH BACK', 'CREDIT', 'DEPOSIT', 'PAYMENT RECEIVED', 'REVERSAL'];
  const isCredit = creditWords.some(w => upper.includes(w));

  return {
    amount,
    merchant: toTitleCase(merchant),
    category,
    date,
    isCredit,
    type: isCredit ? 'income' : 'expense',
  };
}

// ── TITLE CASE HELPER ──
function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── PARSE MANUAL TELEGRAM MESSAGE ──
// Format: [+]amount category [note...]
function parseMessage(text) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  let isIncome = false;
  let amountStr = parts[0];

  if (amountStr.startsWith('+')) {
    isIncome = true;
    amountStr = amountStr.slice(1);
  }

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  const catKey = parts[1].toLowerCase();
  const note = parts.slice(2).join(' ') || '';

  if (isIncome) {
    const category = INCOME_CATS[catKey];
    if (!category) return { error: `Unknown income category: "${parts[1]}"\n\nValid: salary, business, freelance, investment, gift, other` };
    return { type: 'income', amount, category, note, isIncome: true };
  } else {
    const category = EXPENSE_CATS[catKey];
    if (!category) return { error: `Unknown expense category: "${parts[1]}"\n\nValid: food, groceries, transport, housing, bills, fun, health, shopping, education, travel, other` };
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
// ── CLOUD FUNCTION 1: TELEGRAM WEBHOOK (existing manual bot) ──
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
        "`amount category [note]`\n\n" +
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
// ── CLOUD FUNCTION 2: NOTIFICATION WEBHOOK (MacroDroid auto) ──
// MacroDroid on Android POSTs here whenever a bank notification
// arrives. No manual action needed — fully automatic.
// ═══════════════════════════════════════════════════════════════
exports.notificationWebhook = functions.https.onRequest(async (req, res) => {

  // Allow GET for quick health-check
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'ExpenseFlow Notification Webhook is running ✅' });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // MacroDroid sends: { "text": "<full notification text>", "app": "com.discover.mobile", "title": "Purchase Alert" }
    const { text, app, title } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing notification text' });
    }

    console.log('📲 Notification received:', { app, title, text });

    // ── Parse the bank alert ──
    const parsed = parseBankAlert(text);

    if (!parsed) {
      console.log('⚠️ Could not parse notification:', text);
      // Optionally notify via Telegram that parsing failed
      if (TELEGRAM_CHAT_ID) {
        await sendTelegramMessage(TELEGRAM_CHAT_ID,
          `⚠️ *Notification received but couldn't parse it*\n\n` +
          `_"${text.substring(0, 200)}"_\n\n` +
          `Add this expense manually or check the format.`
        );
      }
      return res.status(200).json({ status: 'skipped', reason: 'Could not parse notification text' });
    }

    // ── Skip if this looks like a non-transaction notification ──
    // (e.g. promotional, payment due reminders — not actual purchases)
    const skipWords = ['PAYMENT DUE', 'STATEMENT', 'PROMOTIONAL', 'AVAILABLE CREDIT', 'PAYMENT POSTED'];
    if (skipWords.some(w => text.toUpperCase().includes(w))) {
      console.log('⏭️ Skipping non-transaction notification');
      return res.status(200).json({ status: 'skipped', reason: 'Non-transaction notification' });
    }

    // ── Write to Firestore ──
    const emoji = CAT_EMOJI[parsed.category] || '📌';
    const catName = parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1);
    const appName = app ? app.split('.').pop() : 'Bank';

    const docRef = await db.collection('users').doc(HOUSEHOLD_UID).collection('transactions').add({
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      note: parsed.merchant,             // merchant name as the note
      date: parsed.date,
      addedBy: `Auto (${toTitleCase(appName)})`,
      source: 'notification',           // mark as auto-captured
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Transaction saved:', docRef.id, parsed);

    // ── Send Telegram confirmation ──
    if (TELEGRAM_CHAT_ID) {
      const sign = parsed.type === 'income' ? '+' : '-';
      const label = parsed.type === 'income' ? 'Income' : 'Expense';
      await sendTelegramMessage(TELEGRAM_CHAT_ID,
        `${emoji} *Auto-logged from ${toTitleCase(appName)}!*\n\n` +
        `Amount: *${sign}$${parsed.amount.toFixed(2)}*\n` +
        `Merchant: ${parsed.merchant}\n` +
        `Category: ${catName}\n` +
        `Date: ${parsed.date}\n\n` +
        `✅ Synced to ExpenseFlow`
      );
    }

    return res.status(200).json({
      status: 'success',
      transaction: {
        id: docRef.id,
        amount: parsed.amount,
        merchant: parsed.merchant,
        category: parsed.category,
        date: parsed.date,
        type: parsed.type,
      }
    });

  } catch (err) {
    console.error('❌ notificationWebhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
