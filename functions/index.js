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
