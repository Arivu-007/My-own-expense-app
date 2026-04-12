// =============================================
// ExpenseFlow — Main Application
// =============================================

// Shared household — all family members read/write to this UID's data
const HOUSEHOLD_UID = '74sXH7O3J8YEbxQlIUWMIoRnbGk2';

// Firebase Config
firebase.initializeApp({
  apiKey: "AIzaSyDBvd2VR2QU2a-JYd-2cEeeBA0AuyAnBc0",
  authDomain: "expense-143df.firebaseapp.com",
  projectId: "expense-143df",
  storageBucket: "expense-143df.firebasestorage.app",
  messagingSenderId: "304105495455",
  appId: "1:304105495455:web:fb8cb07fc4eeb7a9ff7baa"
});

const auth = firebase.auth();
const db = firebase.firestore();

// ── CONSTANTS ──
const CATS = {
  expense: [
    { id: 'food',          name: 'Food',          icon: '🍔', color: '#ff6b6b' },
    { id: 'groceries',     name: 'Groceries',     icon: '🛒', color: '#6ab04c' },
    { id: 'transport',     name: 'Transport',     icon: '🚗', color: '#4ecdc4' },
    { id: 'housing',       name: 'Housing',       icon: '🏠', color: '#45b7d1' },
    { id: 'bills',         name: 'Bills',         icon: '💡', color: '#f9ca24' },
    { id: 'entertainment', name: 'Fun',           icon: '🎬', color: '#a29bfe' },
    { id: 'health',        name: 'Health',        icon: '💊', color: '#00b894' },
    { id: 'shopping',      name: 'Shopping',      icon: '🛍️', color: '#fd79a8' },
    { id: 'education',     name: 'Education',     icon: '📚', color: '#0984e3' },
    { id: 'travel',        name: 'Travel',        icon: '✈️', color: '#e17055' },
    { id: 'other',         name: 'Other',         icon: '📌', color: '#b2bec3' },
  ],
  income: [
    { id: 'salary',     name: 'Salary',     icon: '💰', color: '#00d4aa' },
    { id: 'business',   name: 'Business',   icon: '💼', color: '#6c63ff' },
    { id: 'freelance',  name: 'Freelance',  icon: '💻', color: '#4ecdc4' },
    { id: 'investment', name: 'Investment', icon: '📈', color: '#f9ca24' },
    { id: 'gift',       name: 'Gift',       icon: '🎁', color: '#fd79a8' },
    { id: 'other',      name: 'Other',      icon: '➕', color: '#b2bec3' },
  ]
};

// ── STATE ──
const S = {
  user: null,
  transactions: [],
  budget: 0,
  activeTab: 'dashboard',
  txnType: 'expense',
  selectedCat: null,
  editingId: null,
  unsub: {},
  charts: {},
  chartPeriod: 'month',
};

// ── UTILS ──
const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
const fmtDate = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const today = () => new Date().toISOString().split('T')[0];
const getCat = (type, id) => CATS[type]?.find(c => c.id === id) || { icon: '📌', name: id || 'Other', color: '#b2bec3' };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const monthName = (m, y) => new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  clearTimeout(el._to);
  el._to = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── AUTH ──
document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (e) { showToast('Sign-in failed: ' + e.message, 'error'); }
});

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  Object.values(S.unsub).forEach(fn => fn && fn());
  S.transactions = []; S.budget = 0;
  await auth.signOut();
});

auth.onAuthStateChanged(user => {
  S.user = user;
  if (user) { onLogin(user); } else { onLogout(); }
});

function onLogin(user) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('header-greeting').textContent = greeting();
  document.getElementById('header-name').textContent = user.displayName?.split(' ')[0] || 'User';
  const av = document.getElementById('user-avatar');
  av.src = user.photoURL || ''; av.style.display = user.photoURL ? 'block' : 'none';
  listenData(user.uid);
}

function onLogout() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

// ── FIRESTORE LISTENERS ──
function listenData(uid) {
  if (S.unsub.txns) S.unsub.txns();
  if (S.unsub.budget) S.unsub.budget();

  S.unsub.txns = db.collection('users').doc(HOUSEHOLD_UID).collection('transactions')
    .orderBy('date', 'desc')
    .onSnapshot(snap => {
      S.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateAll();
    }, err => console.error('txns:', err));

  S.unsub.budget = db.collection('users').doc(HOUSEHOLD_UID).collection('settings').doc('budget')
    .onSnapshot(doc => {
      S.budget = doc.exists ? (doc.data().amount || 0) : 0;
      document.getElementById('budget-amount-input').value = S.budget || '';
      document.getElementById('quick-budget-input').value = S.budget || '';
      updateBudgetUI();
    });
}

// ── WRITE OPS ──
async function addTxn(data) {
  await db.collection('users').doc(HOUSEHOLD_UID).collection('transactions')
    .add({ ...data, addedBy: S.user.displayName || S.user.email, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

async function updateTxn(id, data) {
  await db.collection('users').doc(HOUSEHOLD_UID).collection('transactions').doc(id)
    .update({ ...data, editedBy: S.user.displayName || S.user.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

async function deleteTxn(id) {
  await db.collection('users').doc(HOUSEHOLD_UID).collection('transactions').doc(id).delete();
}

async function saveBudget(amount) {
  await db.collection('users').doc(HOUSEHOLD_UID).collection('settings').doc('budget')
    .set({ amount: parseFloat(amount) });
}

// ── NAV ──
document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  S.activeTab = tab;
  document.querySelectorAll('.nav-item[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
  const view = document.getElementById('tab-' + tab);
  view.classList.remove('hidden'); view.classList.add('active');
  if (tab === 'charts') renderCharts();
  if (tab === 'budget') renderBudgetDonut();
}

document.getElementById('see-all-btn').addEventListener('click', () => switchTab('transactions'));
document.getElementById('set-budget-btn').addEventListener('click', () => {
  document.getElementById('modal-budget').classList.remove('hidden');
});

// ── UPDATE ALL ──
function updateAll() {
  renderDashboard();
  renderAllTxns();
  populateMonthFilter();
  if (S.activeTab === 'charts') renderCharts();
  if (S.activeTab === 'budget') renderBudgetDonut();
}

// ── DASHBOARD ──
function renderDashboard() {
  const now = new Date();
  const [m, y] = [now.getMonth(), now.getFullYear()];
  const monthly = S.transactions.filter(t => {
    const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y;
  });
  const income = monthly.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthly.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  document.getElementById('total-balance').textContent = fmt(income - expense);
  document.getElementById('total-income').textContent = fmt(income);
  document.getElementById('total-expense').textContent = fmt(expense);
  document.getElementById('balance-month').textContent = monthName(m, y);
  renderTxnList('recent-list', S.transactions.slice(0, 5));
  updateBudgetUI();
}

function updateBudgetUI() {
  const now = new Date();
  const spent = S.transactions.filter(t => {
    const d = new Date(t.date);
    return t.type === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, t) => s + t.amount, 0);

  const b = S.budget;
  const pct = b > 0 ? Math.min((spent / b) * 100, 100) : 0;
  const rem = b - spent;

  document.getElementById('budget-spent-label').textContent = fmt(spent) + ' spent';
  document.getElementById('budget-of-label').textContent = b > 0 ? 'of ' + fmt(b) : 'No budget set';
  const fill = document.getElementById('budget-fill');
  fill.style.width = pct + '%';
  fill.style.background = pct > 90 ? '#ff6b6b' : pct > 70 ? '#f9ca24' : 'linear-gradient(90deg,#6c63ff,#3a86ff)';
  document.getElementById('budget-remaining-label').textContent = b > 0
    ? rem >= 0 ? fmt(rem) + ' remaining' : fmt(Math.abs(rem)) + ' over budget ⚠️'
    : 'Tap "Set Budget" to track spending';
  document.getElementById('budget-remaining-label').style.color = rem < 0 ? '#ff6b6b' : '';

  // Budget tab stats
  document.getElementById('ds-budget').textContent = fmt(b);
  document.getElementById('ds-spent').textContent = fmt(spent);
  document.getElementById('ds-left').textContent = fmt(Math.max(0, rem));
  document.getElementById('donut-pct').textContent = Math.round(pct) + '%';
}

// ── RENDER TRANSACTION ITEMS ──
function renderTxnList(containerId, txns) {
  const el = document.getElementById(containerId);
  if (!txns.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><p>No transactions yet</p><span>Tap + to add your first entry</span></div>`;
    return;
  }
  el.innerHTML = txns.map(t => {
    const cat = getCat(t.type, t.category);
    const addedByBadge = t.addedBy ? `<span class="added-by-badge">${t.addedBy.split(' ')[0] || t.addedBy.split('@')[0]}</span>` : '';
    return `<div class="txn-item">
      <div class="txn-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
      <div class="txn-info">
        <div class="txn-name">${cat.name}</div>
        <div class="txn-meta">${t.note || 'No note'} · ${fmtDate(t.date)}${addedByBadge}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${t.type === 'income' ? 'income-text' : 'expense-text'}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</div>
        <div class="txn-actions">
          <button class="edit-btn" data-id="${t.id}" title="Edit">✏️</button>
          <button class="delete-btn" data-id="${t.id}" title="Delete">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const txn = S.transactions.find(t => t.id === btn.dataset.id);
      if (txn) openModal(txn);
    });
  });
  el.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (confirm('Delete this transaction?')) {
        await deleteTxn(btn.dataset.id);
        showToast('Transaction deleted');
      }
    });
  });
}

// ── ALL TRANSACTIONS ──
function renderAllTxns() {
  let list = [...S.transactions];
  const search = document.getElementById('search-input')?.value?.toLowerCase() || '';
  const type = document.getElementById('filter-type')?.value || 'all';
  const month = document.getElementById('filter-month')?.value || 'all';
  if (search) list = list.filter(t => { const c = getCat(t.type, t.category); return c.name.toLowerCase().includes(search) || (t.note || '').toLowerCase().includes(search); });
  if (type !== 'all') list = list.filter(t => t.type === type);
  if (month !== 'all') {
    const [y, m] = month.split('-').map(Number);
    list = list.filter(t => { const d = new Date(t.date); return d.getFullYear() === y && d.getMonth() === m; });
  }
  renderTxnList('all-list', list);
}

function populateMonthFilter() {
  const months = [...new Set(S.transactions.map(t => { const d = new Date(t.date); return `${d.getFullYear()}-${d.getMonth()}`; }))];
  const sel = document.getElementById('filter-month');
  const cur = sel.value;
  sel.innerHTML = '<option value="all">All Time</option>';
  months.sort().reverse().forEach(m => {
    const [y, mo] = m.split('-').map(Number);
    const o = document.createElement('option');
    o.value = m; o.textContent = monthName(mo, y);
    if (m === cur) o.selected = true;
    sel.appendChild(o);
  });
}

['search-input', 'filter-type', 'filter-month'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', renderAllTxns);
  document.getElementById(id)?.addEventListener('change', renderAllTxns);
});

// ── CHARTS ──
function periodTransactions() {
  const now = new Date();
  return S.transactions.filter(t => {
    const d = new Date(t.date);
    if (S.chartPeriod === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (S.chartPeriod === '3months') return d >= new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return d.getFullYear() === now.getFullYear();
  });
}

function renderCharts() { renderPie(); renderBar(); }

function renderPie() {
  const expenses = periodTransactions().filter(t => t.type === 'expense');
  const totals = {};
  expenses.forEach(t => totals[t.category] = (totals[t.category] || 0) + t.amount);
  const cats = Object.keys(totals).map(id => getCat('expense', id));
  const data = Object.values(totals);
  const colors = cats.map(c => c.color);
  const labels = cats.map(c => c.name);
  const canvas = document.getElementById('pie-chart');
  if (S.charts.pie) S.charts.pie.destroy();
  if (!data.length) {
    document.getElementById('pie-legend').innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px 0">No expense data</p>';
    return;
  }
  S.charts.pie = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'bb'), borderColor: colors, borderWidth: 2, hoverOffset: 8 }] },
    options: { responsive: true, cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } } } }
  });
  document.getElementById('pie-legend').innerHTML = labels.map((l, i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span><span class="legend-name">${l}</span><span class="legend-val">${fmt(data[i])}</span></div>`
  ).join('');
}

function renderBar() {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
  const labels = months.map(d => d.toLocaleString('en-US', { month: 'short' }));
  const incomes = months.map(d => S.transactions.filter(t => { const td = new Date(t.date); return t.type === 'income' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear(); }).reduce((s, t) => s + t.amount, 0));
  const expenses = months.map(d => S.transactions.filter(t => { const td = new Date(t.date); return t.type === 'expense' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear(); }).reduce((s, t) => s + t.amount, 0));
  if (S.charts.bar) S.charts.bar.destroy();
  S.charts.bar = new Chart(document.getElementById('bar-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income', data: incomes, backgroundColor: '#00d4aa33', borderColor: '#00d4aa', borderWidth: 2, borderRadius: 6 },
        { label: 'Expenses', data: expenses, backgroundColor: '#ff6b6b33', borderColor: '#ff6b6b', borderWidth: 2, borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8892b0', font: { family: 'Inter' } } }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
      scales: {
        x: { grid: { color: '#252d3d' }, ticks: { color: '#8892b0' } },
        y: { grid: { color: '#252d3d' }, ticks: { color: '#8892b0', callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) } }
      }
    }
  });
}

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.chartPeriod = btn.dataset.period;
    renderCharts();
  });
});

function renderBudgetDonut() {
  const now = new Date();
  const spent = S.transactions.filter(t => { const d = new Date(t.date); return t.type === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, t) => s + t.amount, 0);
  const b = S.budget;
  const rem = Math.max(0, b - spent);
  if (S.charts.donut) S.charts.donut.destroy();
  S.charts.donut = new Chart(document.getElementById('budget-donut').getContext('2d'), {
    type: 'doughnut',
    data: { datasets: [{ data: b > 0 ? [spent, rem] : [1, 0], backgroundColor: b > 0 ? [spent > b ? '#ff6b6b' : '#6c63ff', '#252d3d'] : ['#252d3d', '#1c2235'], borderWidth: 0 }] },
    options: { responsive: true, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}

// ── ADD TRANSACTION MODAL ──
document.getElementById('fab-add').addEventListener('click', () => openModal());
document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('modal-add').classList.add('hidden');
  S.editingId = null;
});
document.getElementById('modal-add').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    document.getElementById('modal-add').classList.add('hidden');
    S.editingId = null;
  }
});

function openModal(txn = null) {
  S.editingId = txn ? txn.id : null;
  S.selectedCat = txn ? txn.category : null;
  S.txnType = txn ? txn.type : 'expense';
  document.getElementById('txn-amount').value = txn ? txn.amount : '';
  document.getElementById('txn-note').value = txn ? (txn.note || '') : '';
  document.getElementById('txn-date').value = txn ? txn.date : today();
  document.getElementById('modal-title').textContent = txn ? 'Edit Transaction' : 'Add Transaction';
  document.getElementById('save-txn-btn').textContent = txn ? 'Update Transaction' : 'Add Transaction';
  setTxnType(S.txnType);
  // Pre-select category if editing
  if (txn) {
    setTimeout(() => {
      const chip = document.querySelector(`.cat-chip[data-id="${txn.category}"]`);
      if (chip) { chip.classList.add('selected'); }
    }, 50);
  }
  document.getElementById('modal-add').classList.remove('hidden');
  setTimeout(() => document.getElementById('txn-amount').focus(), 300);
}

document.getElementById('btn-expense').addEventListener('click', () => setTxnType('expense'));
document.getElementById('btn-income').addEventListener('click', () => setTxnType('income'));

function setTxnType(type) {
  S.txnType = type; S.selectedCat = null;
  document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
  document.getElementById('btn-income').classList.toggle('active', type === 'income');
  renderCatGrid(type);
}

function renderCatGrid(type) {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = CATS[type].map(c =>
    `<button class="cat-chip${S.selectedCat === c.id ? ' selected' : ''}" data-id="${c.id}" style="--cat-color:${c.color}">
      <span class="cat-icon">${c.icon}</span><span>${c.name}</span>
    </button>`
  ).join('');
  grid.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      S.selectedCat = chip.dataset.id;
      grid.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });
}

document.getElementById('save-txn-btn').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('txn-amount').value);
  const note = document.getElementById('txn-note').value.trim();
  const date = document.getElementById('txn-date').value;
  if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
  if (!S.selectedCat) return showToast('Select a category', 'error');
  if (!date) return showToast('Select a date', 'error');
  const btn = document.getElementById('save-txn-btn');
  btn.disabled = true; btn.textContent = S.editingId ? 'Updating…' : 'Saving…';
  try {
    const payload = { type: S.txnType, amount, category: S.selectedCat, note, date };
    if (S.editingId) {
      await updateTxn(S.editingId, payload);
      showToast('✅ Transaction updated!');
    } else {
      await addTxn(payload);
      showToast(S.txnType === 'income' ? '💰 Income added!' : '💸 Expense added!');
    }
    document.getElementById('modal-add').classList.add('hidden');
    S.editingId = null;
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = S.editingId ? 'Update Transaction' : 'Add Transaction';
  }
});

// ── BUDGET ──
document.getElementById('save-budget-btn').addEventListener('click', async () => {
  const v = document.getElementById('budget-amount-input').value;
  if (!v || parseFloat(v) <= 0) return showToast('Enter a valid budget', 'error');
  await saveBudget(v);
  showToast('🎯 Budget saved!');
  renderBudgetDonut();
});

document.getElementById('close-budget-modal').addEventListener('click', () => document.getElementById('modal-budget').classList.add('hidden'));
document.getElementById('modal-budget').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('modal-budget').classList.add('hidden'); });
document.getElementById('save-quick-budget-btn').addEventListener('click', async () => {
  const v = document.getElementById('quick-budget-input').value;
  if (!v || parseFloat(v) <= 0) return showToast('Enter a valid budget', 'error');
  await saveBudget(v);
  document.getElementById('modal-budget').classList.add('hidden');
  showToast('🎯 Budget saved!');
});

// ── THEME TOGGLE ──
(function initTheme() {
  const saved = localStorage.getItem('ef-theme') || 'dark';
  if (saved === 'light') {
    document.body.classList.add('light');
    document.getElementById('theme-toggle-btn').textContent = '☀️';
  }
})();

document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('theme-toggle-btn').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('ef-theme', isLight ? 'light' : 'dark');
});

// ── PWA SERVICE WORKER ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}
