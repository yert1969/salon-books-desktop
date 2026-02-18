// ================================================================
//  MANE FRAME SALON — DESKTOP EDITION
//  Same Firebase backend, desktop-optimized UI
// ================================================================

'use strict';

// ----------------------------------------------------------------
// 1. FIREBASE INITIALIZATION (Same as mobile)
// ----------------------------------------------------------------

const firebaseConfig = {
  apiKey:            "AIzaSyAQ4HdSBoCDFe5I3k-aWXMCO-98N_44Cso",
  authDomain:        "mane-frame-salon.firebaseapp.com",
  projectId:         "mane-frame-salon",
  storageBucket:     "mane-frame-salon.firebasestorage.app",
  messagingSenderId: "261521689074",
  appId:             "1:261521689074:web:7d095aa53fd87301d8036b",
};

firebase.initializeApp(firebaseConfig);

const auth      = firebase.auth();
const firestore = firebase.firestore();

firestore.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence: multiple tabs open.');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not available in this browser.');
    }
  });

// ----------------------------------------------------------------
// 2. AUTH & CURRENT USER
// ----------------------------------------------------------------

let currentUser = null;

function userCol(name) {
  if (!currentUser) throw new Error('Not authenticated — cannot access DB.');
  return firestore.collection('users').doc(currentUser.uid).collection(name);
}

// ----------------------------------------------------------------
// 3. DB COMPATIBILITY SHIM (Same as mobile - Dexie-like API)
// ----------------------------------------------------------------

function docToObj(doc) {
  if (!doc.exists) return undefined;
  return { ...doc.data(), id: doc.id };
}

function snapToArr(snap) {
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

function makeTable(colName) {
  const col = () => userCol(colName);

  return {
    async toArray() {
      const snap = await col().get();
      return snapToArr(snap);
    },

    async get(id) {
      const doc = await col().doc(String(id)).get();
      return docToObj(doc);
    },

    async add(data) {
      const ref = await col().add(data);
      return ref.id;
    },

    async update(id, changes) {
      await col().doc(String(id)).update(changes);
    },

    async delete(id) {
      await col().doc(String(id)).delete();
    },

    async clear() {
      const snap = await col().get();
      const batch = firestore.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    },

    async bulkAdd(records) {
      const CHUNK = 499;
      for (let i = 0; i < records.length; i += CHUNK) {
        const batch = firestore.batch();
        records.slice(i, i + CHUNK).forEach(r => {
          batch.set(col().doc(), r);
        });
        await batch.commit();
      }
    },

    where(field) {
      return {
        equals(value) {
          const q = col().where(field, '==', value);

          return {
            async toArray() {
              const snap = await q.get();
              return snapToArr(snap);
            },

            async first() {
              const snap = await q.limit(1).get();
              if (snap.empty) return undefined;
              return docToObj(snap.docs[0]);
            },

            filter(fn) {
              return {
                async first() {
                  const snap = await q.get();
                  return snapToArr(snap).find(fn);
                },
              };
            },

            reverse() {
              return {
                limit(n) {
                  return {
                    async toArray() {
                      try {
                        const snap = await q.orderBy('weekStart', 'desc').limit(n).get();
                        return snapToArr(snap);
                      } catch (_) {
                        const snap = await q.get();
                        return snapToArr(snap)
                          .sort((a, b) => (b.weekStart > a.weekStart ? 1 : -1))
                          .slice(0, n);
                      }
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const settingsTable = {
  async get(key) {
    try {
      const doc = await userCol('settings').doc(key).get();
      if (!doc.exists) return undefined;
      return { key: doc.id, ...doc.data() };
    } catch(_) { return undefined; }
  },

  async put(obj) {
    const { key } = obj;
    await userCol('settings').doc(key).set(obj);
  },

  async toArray() {
    const snap = await userCol('settings').get();
    return snap.docs.map(d => ({ key: d.id, ...d.data() }));
  },

  async clear() {
    const snap = await userCol('settings').get();
    const batch = firestore.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  },

  async bulkAdd(records) {
    const batch = firestore.batch();
    records.forEach(r => {
      const ref = userCol('settings').doc(r.key);
      batch.set(ref, r);
    });
    await batch.commit();
  },
};

const db = {
  transactions:    makeTable('transactions'),
  dailySummary:    makeTable('dailySummary'),
  monthlyExpenses: makeTable('monthlyExpenses'),
  renters:         makeTable('renters'),
  rentPayments:    makeTable('rentPayments'),
  settings:        settingsTable,

  async transaction(_mode, ...args) {
    const fn = args[args.length - 1];
    return fn();
  },
};

// ----------------------------------------------------------------
// 4. GOOGLE SIGN-IN / SIGN-OUT
// ----------------------------------------------------------------

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Sign-in failed — please try again');
      console.error(err);
    }
  }
}

async function signOutUser() {
  if (!confirm('Sign out of Mane Frame?')) return;
  await auth.signOut();
}

// ----------------------------------------------------------------
// 5. APP STATE
// ----------------------------------------------------------------

const state = {
  currentView:       'dashboard',
  selectedDate:      todayStr(),
  selectedMonth:     new Date().getMonth() + 1,
  selectedYear:      new Date().getFullYear(),
  reportType:        'daily',
  pinBuffer:         '',
  rentersWeekStart:  null,
  showRentersTab:    false,
  categories:        { INCOME: [], DAILY_EXPENSE: [], MONTHLY_EXPENSE: [] },
};

// ----------------------------------------------------------------
// 6. UTILITY FUNCTIONS
// ----------------------------------------------------------------

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
  return '$' + parseFloat(amount).toFixed(2);
}

function monthName(num) {
  return new Date(2000, num - 1, 1).toLocaleString('en-US', { month: 'long' });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getWeekStart(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}
// ----------------------------------------------------------------
// 7. CATEGORIES
// ----------------------------------------------------------------

function _defaultCategoryMap() {
  return {
    INCOME:          ['Services', 'Tips', 'Booth Rent', 'Retail Sales', 'Other Income'],
    DAILY_EXPENSE:   ['Product', 'Tools & Equipment', 'Utilities', 'Laundry', 'Coffee/Snacks', 'Other'],
    MONTHLY_EXPENSE: ['Rent', 'Insurance', 'Marketing', 'Software', 'Professional Development', 'Supplies'],
  };
}

async function loadCategories() {
  try {
    const stored = await db.settings.get('categories');
    state.categories = stored?.value || _defaultCategoryMap();
  } catch (e) {
    state.categories = _defaultCategoryMap();
    console.warn('loadCategories error:', e);
  }
}

async function saveCategories() {
  await db.settings.put({ key: 'categories', value: state.categories });
}

// ----------------------------------------------------------------
// 8. MODAL FUNCTIONS
// ----------------------------------------------------------------

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
}

// ----------------------------------------------------------------
// 9. NAVIGATION
// ----------------------------------------------------------------

async function updateRentersTabVisibility() {
  const override = await db.settings.get('showRentersTab');
  
  if (override?.value !== undefined) {
    state.showRentersTab = override.value === 'true';
  } else {
    const allRenters = await db.renters.toArray();
    state.showRentersTab = allRenters.length > 0;
  }
}

function navigate(view) {
  state.currentView = view;
  
  // Update nav buttons
  ['dashboard', 'transactions', 'monthly', 'renters', 'reports', 'settings'].forEach(v => {
    const btn = document.getElementById('nav-' + v);
    if (btn) btn.classList.toggle('active', v === view);
  });
  
  // Update renters visibility
  const rentersBtn = document.getElementById('nav-renters');
  if (rentersBtn) {
    rentersBtn.style.display = state.showRentersTab ? 'flex' : 'none';
  }
  
  const views = {
    dashboard:    renderDashboard,
    transactions: renderTransactions,
    monthly:      renderMonthly,
    renters:      renderRenters,
    reports:      renderReports,
    settings:     renderSettings,
  };
  
  if (views[view]) views[view]();
}

// ----------------------------------------------------------------
// 10. DASHBOARD VIEW
// ----------------------------------------------------------------

async function renderDashboard() {
  document.getElementById('page-title').textContent = 'Dashboard';
  document.getElementById('page-subtitle').textContent = formatDateDisplay(todayStr());
  document.getElementById('header-actions').innerHTML = '';
  
  const content = document.getElementById('page-content');
  
  // Get today's data
  const todayTxns = await db.transactions.where('date').equals(todayStr()).toArray();
  const todaySummary = await db.dailySummary.where('date').equals(todayStr()).first();
  
  const todayIncome = todayTxns.filter(t => t.type === 'INCOME');
  const todayExpense = todayTxns.filter(t => t.type === 'EXPENSE');
  
  const todayService = todayIncome.reduce((s, t) => s + (t.serviceAmount || 0), 0);
  const todayTips = todayIncome.reduce((s, t) => s + (t.tipAmount || 0), 0);
  const todayTotal = todayService + todayTips;
  const todayExp = todayExpense.reduce((s, t) => s + (t.amount || 0), 0);
  const todayNet = todayTotal - todayExp;
  
  // Get this month's data
  const monthStr = `${state.selectedYear}-${String(state.selectedMonth).padStart(2,'0')}`;
  const allTxns = await db.transactions.toArray();
  const monthTxns = allTxns.filter(t => t.date && t.date.startsWith(monthStr));
  const monthIncome = monthTxns.filter(t => t.type === 'INCOME');
  
  const monthService = monthIncome.reduce((s, t) => s + (t.serviceAmount || 0), 0);
  const monthTips = monthIncome.reduce((s, t) => s + (t.tipAmount || 0), 0);
  const monthTotal = monthService + monthTips;
  
  content.innerHTML = `
    <!-- Today's Stats -->
    <div class="card-grid cols-4 mb-32">
      <div class="stat-card">
        <div class="stat-label">Today's Income</div>
        <div class="stat-value green">${fmt(todayTotal)}</div>
        <div class="stat-sub">${todayIncome.length} transactions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Expenses</div>
        <div class="stat-value red">${fmt(todayExp)}</div>
        <div class="stat-sub">${todayExpense.length} transactions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Net</div>
        <div class="stat-value ${todayNet >= 0 ? 'green' : 'red'}">${fmt(todayNet)}</div>
        <div class="stat-sub">${todaySummary ? `${todaySummary.clientsSeen} clients, ${todaySummary.hoursWorked}h` : 'No activity logged'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Month to Date</div>
        <div class="stat-value green">${fmt(monthTotal)}</div>
        <div class="stat-sub">${monthName(state.selectedMonth)}</div>
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="card mb-32">
      <h2 class="card-title">Quick Actions</h2>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-primary" onclick="navigate('transactions')">
          ➕ Add Transaction
        </button>
        <button class="btn btn-secondary" onclick="navigate('monthly')">
          💰 Monthly Expenses
        </button>
        <button class="btn btn-secondary" onclick="navigate('reports')">
          📊 View Reports
        </button>
      </div>
    </div>
    
    <!-- Recent Transactions -->
    <div class="card">
      <h2 class="card-title">Recent Transactions</h2>
      ${todayTxns.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-text">No transactions today yet</div>
        </div>
      ` : `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${todayTxns.map(t => `
                <tr>
                  <td><strong>${t.type === 'INCOME' ? '💰 Income' : '💳 Expense'}</strong></td>
                  <td>${t.category || '—'}</td>
                  <td class="${t.type === 'INCOME' ? 'text-success' : 'text-danger'}">
                    ${t.type === 'INCOME' 
                      ? `${fmt(t.serviceAmount || 0)} + ${fmt(t.tipAmount || 0)} tip` 
                      : fmt(t.amount)}
                  </td>
                  <td>${t.paymentMethod || '—'}</td>
                  <td>${t.notes || '—'}</td>
                  <td class="table-actions">
                    <button class="table-btn table-btn-delete" onclick="deleteTransaction('${t.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ----------------------------------------------------------------
// 11. TRANSACTIONS VIEW (Quick Entry + Table)
// ----------------------------------------------------------------

async function renderTransactions() {
  document.getElementById('page-title').textContent = 'Transactions';
  document.getElementById('page-subtitle').textContent = formatDateDisplay(state.selectedDate);
  document.getElementById('header-actions').innerHTML = `
    <input type="date" class="form-input" value="${state.selectedDate}" 
      onchange="state.selectedDate = this.value; renderTransactions();" 
      style="width: 180px;">
  `;
  
  const content = document.getElementById('page-content');
  const txns = await db.transactions.where('date').equals(state.selectedDate).toArray();
  
  content.innerHTML = `
    <!-- Quick Add Form -->
    <div class="card mb-24">
      <h2 class="card-title">Add Transaction</h2>
      <form onsubmit="saveQuickTransaction(event); return false;">
        <div class="form-row cols-3">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="quick-type" onchange="updateQuickForm()">
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </select>
          </div>
          <div class="form-group" id="quick-category-wrap">
            <label class="form-label">Category</label>
            <select class="form-select" id="quick-category">
              ${state.categories.INCOME.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Method</label>
            <select class="form-select" id="quick-payment">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Check">Check</option>
              <option value="Venmo">Venmo</option>
              <option value="Zelle">Zelle</option>
            </select>
          </div>
        </div>
        
        <div class="form-row cols-3" id="quick-amounts">
          <div class="form-group">
            <label class="form-label">Service Amount</label>
            <input type="number" class="form-input" id="quick-service" step="0.01" min="0" placeholder="0.00">
          </div>
          <div class="form-group">
            <label class="form-label">Tip Amount</label>
            <input type="number" class="form-input" id="quick-tip" step="0.01" min="0" placeholder="0.00">
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <input type="text" class="form-input" id="quick-notes" placeholder="e.g., Client name">
          </div>
        </div>
        
        <div style="display: flex; gap: 12px; margin-top: 16px;">
          <button type="submit" class="btn btn-primary">Save Transaction</button>
          <button type="button" class="btn btn-secondary" onclick="clearQuickForm()">Clear</button>
        </div>
      </form>
    </div>
    
    <!-- Transactions Table -->
    <div class="card">
      <h2 class="card-title">Transactions for ${formatDateShort(state.selectedDate)}</h2>
      ${txns.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-text">No transactions for this date</div>
        </div>
      ` : `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${txns.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map(t => `
                <tr>
                  <td>${t.timestamp ? new Date(t.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td><strong>${t.type === 'INCOME' ? '💰 Income' : '💳 Expense'}</strong></td>
                  <td>${t.category || '—'}</td>
                  <td class="${t.type === 'INCOME' ? 'text-success' : 'text-danger'}">
                    <strong>${t.type === 'INCOME' 
                      ? fmt((t.serviceAmount || 0) + (t.tipAmount || 0))
                      : fmt(t.amount)}</strong>
                    ${t.type === 'INCOME' && t.tipAmount > 0 ? `<div style="font-size:11px;color:var(--text-muted);">${fmt(t.serviceAmount)} + ${fmt(t.tipAmount)} tip</div>` : ''}
                  </td>
                  <td>${t.paymentMethod || '—'}</td>
                  <td>${t.notes || '—'}</td>
                  <td class="table-actions">
                    <button class="table-btn table-btn-delete" onclick="deleteTransaction('${t.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function updateQuickForm() {
  const type = document.getElementById('quick-type').value;
  const categorySelect = document.getElementById('quick-category');
  const amountsDiv = document.getElementById('quick-amounts');
  
  // Update category options
  const cats = type === 'INCOME' ? state.categories.INCOME : state.categories.DAILY_EXPENSE;
  categorySelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  
  // Update amount fields
  if (type === 'INCOME') {
    amountsDiv.innerHTML = `
      <div class="form-group">
        <label class="form-label">Service Amount</label>
        <input type="number" class="form-input" id="quick-service" step="0.01" min="0" placeholder="0.00" required>
      </div>
      <div class="form-group">
        <label class="form-label">Tip Amount</label>
        <input type="number" class="form-input" id="quick-tip" step="0.01" min="0" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <input type="text" class="form-input" id="quick-notes" placeholder="e.g., Client name">
      </div>
    `;
  } else {
    amountsDiv.innerHTML = `
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" class="form-input" id="quick-amount" step="0.01" min="0" placeholder="0.00" required>
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <input type="text" class="form-input" id="quick-notes" placeholder="Description" style="grid-column: span 2;">
      </div>
    `;
  }
}

async function saveQuickTransaction(e) {
  e.preventDefault();
  
  const type = document.getElementById('quick-type').value;
  const category = document.getElementById('quick-category').value;
  const payment = document.getElementById('quick-payment').value;
  const notes = document.getElementById('quick-notes').value.trim();
  
  if (type === 'INCOME') {
    const service = parseFloat(document.getElementById('quick-service').value) || 0;
    const tip = parseFloat(document.getElementById('quick-tip').value) || 0;
    
    if (service === 0 && tip === 0) {
      showToast('Please enter an amount');
      return;
    }
    
    await db.transactions.add({
      type: 'INCOME',
      category,
      serviceAmount: service,
      tipAmount: tip,
      paymentMethod: payment,
      notes,
      date: state.selectedDate,
      timestamp: Date.now(),
    });
    
    showToast('Income added ✓');
  } else {
    const amount = parseFloat(document.getElementById('quick-amount').value) || 0;
    
    if (amount === 0) {
      showToast('Please enter an amount');
      return;
    }
    
    await db.transactions.add({
      type: 'EXPENSE',
      category,
      amount,
      paymentMethod: payment,
      notes,
      date: state.selectedDate,
      timestamp: Date.now(),
    });
    
    showToast('Expense added ✓');
  }
  
  clearQuickForm();
  renderTransactions();
}

function clearQuickForm() {
  const type = document.getElementById('quick-type').value;
  if (type === 'INCOME') {
    document.getElementById('quick-service').value = '';
    document.getElementById('quick-tip').value = '';
  } else {
    const amountField = document.getElementById('quick-amount');
    if (amountField) amountField.value = '';
  }
  document.getElementById('quick-notes').value = '';
}

async function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  await db.transactions.delete(id);
  showToast('Deleted ✓');
  
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'transactions') renderTransactions();
}
// ----------------------------------------------------------------
// 12. MONTHLY EXPENSES VIEW
// ----------------------------------------------------------------

async function renderMonthly() {
  document.getElementById('page-title').textContent = 'Monthly Expenses';
  document.getElementById('page-subtitle').textContent = `${monthName(state.selectedMonth)} ${state.selectedYear}`;
  document.getElementById('header-actions').innerHTML = `
    <select class="form-select" value="${state.selectedMonth}" 
      onchange="state.selectedMonth = parseInt(this.value); renderMonthly();" 
      style="width: 150px;">
      ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
        <option value="${m}" ${m === state.selectedMonth ? 'selected' : ''}>${monthName(m)}</option>
      `).join('')}
    </select>
    <select class="form-select" value="${state.selectedYear}" 
      onchange="state.selectedYear = parseInt(this.value); renderMonthly();" 
      style="width: 120px;">
      ${[2024, 2025, 2026].map(y => `
        <option value="${y}" ${y === state.selectedYear ? 'selected' : ''}>${y}</option>
      `).join('')}
    </select>
    <button class="btn btn-primary" onclick="openAddMonthlyExpenseModal()">➕ Add Expense</button>
  `;
  
  const content = document.getElementById('page-content');
  const monthStr = `${state.selectedYear}-${String(state.selectedMonth).padStart(2,'0')}`;
  const expenses = await db.monthlyExpenses.toArray();
  const monthExpenses = expenses.filter(e => e.month === monthStr);
  
  const total = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  
  content.innerHTML = `
    <div class="stat-card mb-24">
      <div class="stat-label">Total Monthly Expenses</div>
      <div class="stat-value red">${fmt(total)}</div>
      <div class="stat-sub">${monthExpenses.length} expenses</div>
    </div>
    
    <div class="card">
      <h2 class="card-title">Expenses for ${monthName(state.selectedMonth)} ${state.selectedYear}</h2>
      ${monthExpenses.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">💰</div>
          <div class="empty-text">No monthly expenses recorded yet</div>
        </div>
      ` : `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${monthExpenses.map(e => `
                <tr>
                  <td><strong>${e.category}</strong></td>
                  <td>${e.description || '—'}</td>
                  <td class="text-danger"><strong>${fmt(e.amount)}</strong></td>
                  <td>${e.dueDate ? formatDateShort(e.dueDate) : '—'}</td>
                  <td>
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; ${e.paid ? 'background: var(--success); color: #fff;' : 'background: var(--warning); color: #fff;'}">
                      ${e.paid ? '✓ Paid' : 'Pending'}
                    </span>
                  </td>
                  <td class="table-actions">
                    <button class="table-btn table-btn-edit" onclick="togglePaidStatus('${e.id}', ${!e.paid})">${e.paid ? 'Mark Unpaid' : 'Mark Paid'}</button>
                    <button class="table-btn table-btn-delete" onclick="deleteMonthlyExpense('${e.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function openAddMonthlyExpenseModal() {
  const monthStr = `${state.selectedYear}-${String(state.selectedMonth).padStart(2,'0')}`;
  
  openModal(`
    <h2 class="modal-title">Add Monthly Expense</h2>
    <form onsubmit="saveMonthlyExpense(event); return false;">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="mexp-category" required>
          ${state.categories.MONTHLY_EXPENSE.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" class="form-input" id="mexp-desc" placeholder="e.g., Studio rent">
      </div>
      
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" class="form-input" id="mexp-amount" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label class="form-label">Due Date (optional)</label>
          <input type="date" class="form-input" id="mexp-due">
        </div>
      </div>
      
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="mexp-paid">
          <span class="form-label" style="margin: 0;">Mark as paid</span>
        </label>
      </div>
      
      <input type="hidden" id="mexp-month" value="${monthStr}">
      
      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button type="submit" class="btn btn-primary">Save Expense</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
}

async function saveMonthlyExpense(e) {
  e.preventDefault();
  
  await db.monthlyExpenses.add({
    category: document.getElementById('mexp-category').value,
    description: document.getElementById('mexp-desc').value.trim(),
    amount: parseFloat(document.getElementById('mexp-amount').value),
    dueDate: document.getElementById('mexp-due').value || null,
    paid: document.getElementById('mexp-paid').checked,
    month: document.getElementById('mexp-month').value,
  });
  
  closeModal();
  showToast('Monthly expense added ✓');
  renderMonthly();
}

async function togglePaidStatus(id, paid) {
  await db.monthlyExpenses.update(id, { paid });
  showToast(paid ? 'Marked as paid ✓' : 'Marked as unpaid');
  renderMonthly();
}

async function deleteMonthlyExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await db.monthlyExpenses.delete(id);
  showToast('Deleted ✓');
  renderMonthly();
}

// ----------------------------------------------------------------
// 13. RENTERS VIEW (Simplified)
// ----------------------------------------------------------------

async function renderRenters() {
  document.getElementById('page-title').textContent = 'Booth Renters';
  document.getElementById('page-subtitle').textContent = 'Manage your booth renters and payments';
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-primary" onclick="openAddRenterModal()">➕ Add Renter</button>
  `;
  
  const content = document.getElementById('page-content');
  const renters = await db.renters.where('status').equals('active').toArray();
  
  if (renters.length === 0) {
    content.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-text">
            No active booth renters yet.<br>
            Add your first renter to get started.
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  content.innerHTML = `
    <div class="card-grid cols-3 mb-24">
      ${renters.map(r => `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <div>
              <h3 style="font-size: 18px; font-weight: 700; color: var(--plum); margin: 0 0 4px;">${r.name}</h3>
              <div style="font-size: 13px; color: var(--text-muted);">
                ${r.booth ? `Booth ${r.booth}` : 'No booth assigned'}
              </div>
            </div>
          </div>
          
          <div style="padding: 12px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-bottom: 12px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Weekly Rate</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--plum);">${fmt(r.weeklyRate || 0)}</div>
          </div>
          
          ${r.notes ? `<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">${r.notes}</div>` : ''}
          
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-icon" onclick="deleteRenter('${r.id}')" title="Remove renter">
              🗑️
            </button>
          </div>
        </div>
      `).join('')}
    </div>
    
    <div class="card">
      <h2 class="card-title">Weekly Summary</h2>
      <div class="stat-card">
        <div class="stat-label">Total Expected Weekly</div>
        <div class="stat-value green">${fmt(renters.reduce((s, r) => s + (r.weeklyRate || 0), 0))}</div>
        <div class="stat-sub">${renters.length} active renter${renters.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `;
}

function openAddRenterModal() {
  openModal(`
    <h2 class="modal-title">Add Booth Renter</h2>
    <form onsubmit="saveRenter(event); return false;">
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="renter-name" required>
      </div>
      
      <div class="form-row cols-2">
        <div class="form-group">
          <label class="form-label">Booth Number (optional)</label>
          <input type="text" class="form-input" id="renter-booth" placeholder="e.g., 1, 2A">
        </div>
        <div class="form-group">
          <label class="form-label">Weekly Rate</label>
          <input type="number" class="form-input" id="renter-rate" step="0.01" value="140" required>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <textarea class="form-textarea" id="renter-notes" placeholder="Any additional information..."></textarea>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button type="submit" class="btn btn-primary">Add Renter</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
}

async function saveRenter(e) {
  e.preventDefault();
  
  await db.renters.add({
    name: document.getElementById('renter-name').value.trim(),
    booth: document.getElementById('renter-booth').value.trim() || null,
    weeklyRate: parseFloat(document.getElementById('renter-rate').value),
    notes: document.getElementById('renter-notes').value.trim(),
    status: 'active',
    startDate: todayStr(),
  });
  
  await updateRentersTabVisibility();
  closeModal();
  showToast('Renter added ✓');
  navigate('renters');
}

async function deleteRenter(id) {
  if (!confirm('Remove this renter? This cannot be undone.')) return;
  await db.renters.update(id, { status: 'inactive' });
  await updateRentersTabVisibility();
  showToast('Renter removed ✓');
  renderRenters();
}

// ----------------------------------------------------------------
// 14. REPORTS VIEW (Simplified)
// ----------------------------------------------------------------

async function renderReports() {
  document.getElementById('page-title').textContent = 'Reports';
  document.getElementById('page-subtitle').textContent = 'View your business insights';
  document.getElementById('header-actions').innerHTML = '';
  
  const content = document.getElementById('page-content');
  
  content.innerHTML = `
    <div class="card">
      <h2 class="card-title">Select Report Type</h2>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
        <button class="btn btn-secondary" onclick="showMonthlyReport()" style="padding: 24px;">
          <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
          <div style="font-weight: 700; margin-bottom: 4px;">Monthly Report</div>
          <div style="font-size: 12px; opacity: 0.7;">Income & expenses by month</div>
        </button>
        
        <button class="btn btn-secondary" onclick="showCategoryReport()" style="padding: 24px;">
          <div style="font-size: 32px; margin-bottom: 8px;">📈</div>
          <div style="font-weight: 700; margin-bottom: 4px;">Category Breakdown</div>
          <div style="font-size: 12px; opacity: 0.7;">By income/expense category</div>
        </button>
        
        <button class="btn btn-secondary" onclick="showAnnualReport()" style="padding: 24px;">
          <div style="font-size: 32px; margin-bottom: 8px;">📅</div>
          <div style="font-weight: 700; margin-bottom: 4px;">Annual Report</div>
          <div style="font-size: 12px; opacity: 0.7;">Year-end summary</div>
        </button>
      </div>
    </div>
    
    <div id="report-output" style="margin-top: 24px;"></div>
  `;
}

async function showMonthlyReport() {
  const monthStr = `${state.selectedYear}-${String(state.selectedMonth).padStart(2,'0')}`;
  const allTxns = await db.transactions.toArray();
  const monthTxns = allTxns.filter(t => t.date && t.date.startsWith(monthStr));
  
  const income = monthTxns.filter(t => t.type === 'INCOME');
  const expense = monthTxns.filter(t => t.type === 'EXPENSE');
  
  const services = income.reduce((s, t) => s + (t.serviceAmount || 0), 0);
  const tips = income.reduce((s, t) => s + (t.tipAmount || 0), 0);
  const dailyExp = expense.reduce((s, t) => s + (t.amount || 0), 0);
  
  const mExps = await db.monthlyExpenses.toArray();
  const monthlyExp = mExps.filter(e => e.month === monthStr).reduce((s, e) => s + (e.amount || 0), 0);
  
  const total = services + tips;
  const totalExp = dailyExp + monthlyExp;
  const net = total - totalExp;
  
  document.getElementById('report-output').innerHTML = `
    <div class="card">
      <h2 class="card-title">${monthName(state.selectedMonth)} ${state.selectedYear} Summary</h2>
      
      <div class="card-grid cols-3 mb-24">
        <div class="stat-card">
          <div class="stat-label">Total Income</div>
          <div class="stat-value green">${fmt(total)}</div>
          <div class="stat-sub">${fmt(services)} services + ${fmt(tips)} tips</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Expenses</div>
          <div class="stat-value red">${fmt(totalExp)}</div>
          <div class="stat-sub">${fmt(dailyExp)} daily + ${fmt(monthlyExp)} monthly</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Net Profit</div>
          <div class="stat-value ${net >= 0 ? 'green' : 'red'}">${fmt(net)}</div>
          <div class="stat-sub">${((net / total) * 100).toFixed(1)}% profit margin</div>
        </div>
      </div>
    </div>
  `;
}

async function showCategoryReport() {
  document.getElementById('report-output').innerHTML = `
    <div class="card">
      <h2 class="card-title">Category Breakdown - Coming Soon</h2>
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-text">Category reports with charts will be available in the next update</div>
      </div>
    </div>
  `;
}

async function showAnnualReport() {
  document.getElementById('report-output').innerHTML = `
    <div class="card">
      <h2 class="card-title">Annual Report - Coming Soon</h2>
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-text">Annual reports will be available in the next update</div>
      </div>
    </div>
  `;
}
// ----------------------------------------------------------------
// 15. SETTINGS VIEW
// ----------------------------------------------------------------

async function renderSettings() {
  document.getElementById('page-title').textContent = 'Settings';
  document.getElementById('page-subtitle').textContent = 'Manage your preferences and data';
  document.getElementById('header-actions').innerHTML = '';
  
  const content = document.getElementById('page-content');
  const bizName = await db.settings.get('businessName');
  const pinSet = await db.settings.get('pin');
  const pinOn = await db.settings.get('pinEnabled');
  
  const rentersOverride = await db.settings.get('showRentersTab');
  const allRenters = await db.renters.toArray();
  let rentersStatus;
  if (!rentersOverride || rentersOverride.value === undefined) {
    rentersStatus = allRenters.length > 0 
      ? 'Auto (shown — you have renters)' 
      : 'Auto (hidden — no renters yet)';
  } else if (rentersOverride.value === 'true') {
    rentersStatus = 'Always shown';
  } else {
    rentersStatus = 'Always hidden';
  }
  
  content.innerHTML = `
    <div class="card mb-24">
      <h2 class="card-title">Business Information</h2>
      <div class="form-group">
        <label class="form-label">Business Name</label>
        <input type="text" class="form-input" id="biz-name" value="${bizName ? bizName.value : ''}" placeholder="e.g., Annette's Salon">
      </div>
      <button class="btn btn-primary" onclick="saveBusinessName()">Save Name</button>
    </div>
    
    <div class="card mb-24">
      <h2 class="card-title">Security</h2>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: var(--cream); border-radius: 8px; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">${pinSet ? 'Change PIN' : 'Set Up PIN Lock'}</div>
          <div style="font-size: 13px; color: var(--text-muted);">${pinOn?.value === 'true' ? 'PIN lock is ON' : 'PIN lock is OFF'}</div>
        </div>
        <button class="btn btn-secondary" onclick="openPINSettings()">Configure</button>
      </div>
    </div>
    
    <div class="card mb-24">
      <h2 class="card-title">Features</h2>
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: var(--cream); border-radius: 8px;">
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">Show Booth Renters Tab</div>
          <div style="font-size: 13px; color: var(--text-muted);">${rentersStatus}</div>
        </div>
        <button class="btn btn-secondary" onclick="toggleRentersTab()">Toggle</button>
      </div>
    </div>
    
    <div class="card mb-24">
      <h2 class="card-title">Data Management</h2>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-primary" onclick="exportBackup()">⬇ Export Backup</button>
        <button class="btn btn-secondary" onclick="triggerRestoreFilePicker()">⬆ Restore from Backup</button>
      </div>
      <input type="file" id="restore-file-input" accept=".json" style="display: none;" onchange="importBackup(this.files[0])">
    </div>
    
    <div class="card">
      <h2 class="card-title">Account</h2>
      <button class="btn btn-danger" onclick="signOutUser()">Sign Out</button>
    </div>
  `;
}

async function saveBusinessName() {
  const name = document.getElementById('biz-name').value.trim();
  if (!name) {
    showToast('Please enter a business name');
    return;
  }
  await db.settings.put({ key: 'businessName', value: name });
  showToast('Business name saved ✓');
}

async function toggleRentersTab() {
  const override = await db.settings.get('showRentersTab');
  const wasHidden = !state.showRentersTab;
  
  let newValue;
  if (!override || override.value === undefined) {
    newValue = 'true';
  } else if (override.value === 'true') {
    newValue = 'false';
  } else {
    await db.settings.delete('showRentersTab');
    await updateRentersTabVisibility();
    navigate(state.currentView);
    return;
  }
  
  await db.settings.put({ key: 'showRentersTab', value: newValue });
  await updateRentersTabVisibility();
  
  if (wasHidden && state.showRentersTab) {
    navigate('renters');
  } else {
    navigate(state.currentView);
  }
}

async function exportBackup() {
  const data = {
    transactions:    await db.transactions.toArray(),
    dailySummary:    await db.dailySummary.toArray(),
    monthlyExpenses: await db.monthlyExpenses.toArray(),
    renters:         await db.renters.toArray(),
    rentPayments:    await db.rentPayments.toArray(),
    settings:        await db.settings.toArray(),
    categories:      state.categories,
    exportDate:      new Date().toISOString(),
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mane-frame-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  await db.settings.put({ key: 'lastBackup', value: todayStr() });
  showToast('Backup downloaded ✓');
}

function triggerRestoreFilePicker() {
  document.getElementById('restore-file-input').click();
}

async function importBackup(file) {
  if (!file) return;
  
  if (!confirm('⚠️ Restore from backup?\n\nThis will REPLACE all current data. This cannot be undone.\n\nAre you sure?')) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.transactions) {
      showToast('Invalid backup file');
      return;
    }
    
    let catMap;
    if (Array.isArray(data.categories)) {
      catMap = { INCOME: [], DAILY_EXPENSE: [], MONTHLY_EXPENSE: [] };
      data.categories.forEach(c => {
        if (c.type && catMap[c.type]) catMap[c.type].push(c.name);
      });
    } else if (data.categories && typeof data.categories === 'object') {
      catMap = data.categories;
    } else {
      catMap = _defaultCategoryMap();
    }
    
    const strip = arr => arr.map(({ id, ...rest }) => rest);
    
    await db.transactions.clear();
    await db.dailySummary.clear();
    await db.monthlyExpenses.clear();
    await db.renters.clear();
    await db.rentPayments.clear();
    await db.settings.clear();
    
    await db.transactions.bulkAdd(strip(data.transactions || []));
    await db.dailySummary.bulkAdd(strip(data.dailySummary || []));
    await db.monthlyExpenses.bulkAdd(strip(data.monthlyExpenses || []));
    await db.renters.bulkAdd(strip(data.renters || []));
    await db.rentPayments.bulkAdd(strip(data.rentPayments || []));
    
    if (data.settings && Array.isArray(data.settings)) {
      await db.settings.bulkAdd(data.settings);
    }
    
    state.categories = catMap;
    await saveCategories();
    await db.settings.put({ key: 'lastBackup', value: todayStr() });
    await updateRentersTabVisibility();
    
    showToast('Restore complete ✓');
    navigate('dashboard');
  } catch (err) {
    showToast('Restore failed — file may be corrupt');
    console.error(err);
  }
}

// ----------------------------------------------------------------
// 16. PIN FUNCTIONALITY
// ----------------------------------------------------------------

let pinBuffer = '';
let pinPadInitialized = false;

function openPINSettings() {
  openModal(`
    <h2 class="modal-title">PIN Lock Settings</h2>
    <p style="color: var(--text-muted); margin-bottom: 20px;">
      Set a 4-digit PIN to protect your data when opening the app.
    </p>
    
    <div class="form-group">
      <label class="form-label">Enter New PIN (4 digits)</label>
      <input type="password" class="form-input" id="new-pin" maxlength="4" pattern="[0-9]{4}" placeholder="e.g., 1234">
    </div>
    
    <div class="form-group">
      <label class="form-label">Confirm PIN</label>
      <input type="password" class="form-input" id="confirm-pin" maxlength="4" pattern="[0-9]{4}">
    </div>
    
    <div style="display: flex; gap: 12px; margin-top: 24px;">
      <button class="btn btn-primary" onclick="savePIN()">Set PIN</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function savePIN() {
  const newPin = document.getElementById('new-pin').value;
  const confirmPin = document.getElementById('confirm-pin').value;
  
  if (!newPin || !confirmPin) {
    showToast('Please enter PIN in both fields');
    return;
  }
  
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    showToast('PIN must be exactly 4 digits');
    return;
  }
  
  if (newPin !== confirmPin) {
    showToast('PINs do not match');
    return;
  }
  
  await db.settings.put({ key: 'pin', value: newPin });
  await db.settings.put({ key: 'pinEnabled', value: 'true' });
  
  closeModal();
  showToast('PIN set successfully ✓');
  renderSettings();
}

function initPINPad() {
  if (pinPadInitialized) return;
  
  document.querySelectorAll('.pin-btn[data-num]').forEach(btn => {
    btn.addEventListener('click', () => enterPin(btn.dataset.num));
  });
  document.getElementById('pin-back')?.addEventListener('click', clearPin);
  
  pinPadInitialized = true;
}

function enterPin(num) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += num;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(checkPin, 150);
  }
}

function clearPin() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`dot-${i}`)?.classList.toggle('filled', i < pinBuffer.length);
  }
}

async function checkPin() {
  const stored = await db.settings.get('pin');
  if (stored && pinBuffer === stored.value) {
    document.getElementById('pin-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    navigate('dashboard');
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
    pinBuffer = '';
    updatePinDots();
  }
}

// ----------------------------------------------------------------
// 17. APP BOOT SEQUENCE
// ----------------------------------------------------------------

async function bootApp() {
  await loadCategories();
  await updateRentersTabVisibility();
  
  // Update user info in sidebar
  if (currentUser) {
    document.getElementById('user-name').textContent = currentUser.displayName || 'User';
    document.getElementById('user-email').textContent = currentUser.email || '';
  }
  
  const pinSetting = await db.settings.get('pin');
  const pinEnabled = await db.settings.get('pinEnabled');
  const shouldPin = pinSetting && pinEnabled?.value === 'true';
  
  document.getElementById('login-screen').classList.add('hidden');
  
  if (shouldPin) {
    document.getElementById('pin-screen').classList.remove('hidden');
    initPINPad();
  } else {
    document.getElementById('app').classList.remove('hidden');
    navigate('dashboard');
  }
}

// Firebase auth state listener
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    bootApp();
  } else {
    currentUser = null;
    document.getElementById('pin-screen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  }
});
