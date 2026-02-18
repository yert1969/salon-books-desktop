// ============================================================
// MANE FRAME SALON - DESKTOP APP (FULL FEATURED)
// ============================================================

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAQ4HdSBoCDFe5I3k-aWXMCO-98N_44Cso",
  authDomain: "mane-frame-salon.firebaseapp.com",
  projectId: "mane-frame-salon",
  storageBucket: "mane-frame-salon.firebasestorage.app",
  messagingSenderId: "420265936690",
  appId: "1:420265936690:web:2c4b5b0a2e8769f2f8e61d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

// IndexedDB (Dexie) for local cache
const db = new Dexie('ManeFrameDesktop');
db.version(1).stores({
  transactions: 'id, userId, date, type, category',
  monthlyExpenses: 'id, userId, year, month, category',
  renters: 'id, userId, name',
  categories: 'id, userId, type'
});

// Global State
let currentUser = null;
let state = {
  currentView: 'daily',
  selectedDate: todayStr(),
  selectedMonth: new Date().getMonth() + 1,
  selectedYear: new Date().getFullYear(),
  reportType: 'weekly',
  categories: {
    INCOME: ['Haircut', 'Color', 'Highlights', 'Perm', 'Extensions', 'Treatment', 'Blowout', 'Styling', 'Other'],
    DAILY_EXPENSE: ['Products', 'Supplies', 'Lunch', 'Gas', 'Parking', 'Other'],
    MONTHLY_EXPENSE: ['Booth Rent', 'Insurance', 'License Renewal', 'Marketing', 'Equipment', 'Other']
  }
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

function fmt(num) {
  return '$' + Number(num).toFixed(2);
}

function monthName(m) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months[m - 1] || '';
}

function monthNameShort(m) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[m - 1] || '';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal-content').innerHTML = '';
}

function confirmDialog(message, title = 'Confirm') {
  return new Promise((resolve) => {
    openModal(`
      <h2 class="modal-title">${title}</h2>
      <div style="font-size:15px;line-height:1.6;color:var(--text);margin:20px 0;white-space:pre-line;">${message}</div>
      <div style="display:flex;gap:8px;margin-top:24px;">
        <button class="btn-secondary" style="flex:1;" onclick="window._confirmResolve(false)">Cancel</button>
        <button class="btn-danger" style="flex:1;" onclick="window._confirmResolve(true)">Delete</button>
      </div>
    `);
    
    window._confirmResolve = (result) => {
      closeModal();
      delete window._confirmResolve;
      resolve(result);
    };
  });
}

// ============================================================
// AUTHENTICATION
// ============================================================

auth.onAuthStateChanged(async user => {
  console.log('Auth state changed:', user ? user.email : 'signed out');
  
  if (user) {
    currentUser = user;
    
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app');
    
    loginScreen.classList.add('hidden');
    loginScreen.style.display = 'none';
    
    appScreen.classList.remove('hidden');
    appScreen.style.display = 'block';
    
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('header-date').textContent = new Date().toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    console.log('Syncing data...');
    await syncFromFirestore();
    console.log('Loading categories...');
    await loadCategories();
    console.log('Rendering daily view...');
    navigate('daily');
    console.log('App ready!');
  } else {
    currentUser = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').classList.add('hidden');
    document.getElementById('app').style.display = 'none';
  }
});

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    showToast('Sign in failed: ' + err.message);
  }
});

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  await auth.signOut();
});

// ============================================================
// DATA SYNC
// ============================================================

async function syncFromFirestore() {
  if (!currentUser) return;
  
  const uid = currentUser.uid;
  
  try {
    const txnSnapshot = await firestore.collection('users').doc(uid).collection('transactions').get();
    for (const doc of txnSnapshot.docs) {
      await db.transactions.put({ id: doc.id, userId: uid, ...doc.data() });
    }
    console.log(`Synced ${txnSnapshot.docs.length} transactions`);
    
    const expSnapshot = await firestore.collection('users').doc(uid).collection('monthlyExpenses').get();
    for (const doc of expSnapshot.docs) {
      await db.monthlyExpenses.put({ id: doc.id, userId: uid, ...doc.data() });
    }
    console.log(`Synced ${expSnapshot.docs.length} monthly expenses`);
    
    const renterSnapshot = await firestore.collection('users').doc(uid).collection('renters').get();
    for (const doc of renterSnapshot.docs) {
      await db.renters.put({ id: doc.id, userId: uid, ...doc.data() });
    }
    console.log(`Synced ${renterSnapshot.docs.length} renters`);
  } catch (err) {
    console.error('Sync error:', err);
  }
}

async function loadCategories() {
  if (!currentUser) return;
  
  try {
    const doc = await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').get();
    if (doc.exists) {
      const firestoreCategories = doc.data();
      state.categories = {
        INCOME: firestoreCategories.INCOME || state.categories.INCOME,
        DAILY_EXPENSE: firestoreCategories.DAILY_EXPENSE || state.categories.DAILY_EXPENSE,
        MONTHLY_EXPENSE: firestoreCategories.MONTHLY_EXPENSE || state.categories.MONTHLY_EXPENSE
      };
    }
    console.log('Categories loaded');
  } catch (err) {
    console.error('Category load error:', err);
  }
}

async function saveCategories() {
  if (!currentUser) return;
  try {
    await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').set(state.categories);
    showToast('Categories saved');
  } catch (err) {
    console.error('Save categories error:', err);
    showToast('Failed to save categories');
  }
}

// ============================================================
// NAVIGATION
// ============================================================

function navigate(view) {
  console.log('Navigating to:', view);
  state.currentView = view;
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const navBtn = document.querySelector(`[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');
  
  try {
    switch(view) {
      case 'daily': renderDailyView(); break;
      case 'monthly': renderMonthlyView(); break;
      case 'renters': renderRentersView(); break;
      case 'reports': renderReportsView(); break;
      case 'settings': renderSettingsView(); break;
    }
    console.log('View rendered');
  } catch (err) {
    console.error('Render error:', err);
    document.getElementById('content').innerHTML = `
      <div class="card" style="text-align:center; padding:40px;">
        <h2 style="color:var(--danger);">Error</h2>
        <p>${err.message}</p>
        <button class="btn-primary" onclick="location.reload()">Reload</button>
      </div>
    `;
  }
}

// ============================================================
// DAILY VIEW
// ============================================================

async function renderDailyView() {
  const content = document.getElementById('content');
  
  const transactions = await db.transactions.where('date').equals(state.selectedDate).toArray();
  
  const income = transactions.filter(t => t.type === 'INCOME');
  const expenses = transactions.filter(t => t.type === 'EXPENSE');
  
  const totalIncome = income.reduce((sum, t) => sum + (t.serviceAmount || 0) + (t.tipAmount || 0), 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + (t.amount || 0), 0);
  const net = totalIncome - totalExpenses;
  
  const dateObj = new Date(state.selectedDate + 'T00:00:00');
  const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Daily Log</h2>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
        <button class="btn-secondary" onclick="changeDate(-1)">← Prev</button>
        <input type="date" class="form-input" style="width:auto;" value="${state.selectedDate}" onchange="state.selectedDate=this.value; renderDailyView()">
        <button class="btn-secondary" onclick="changeDate(1)">Next →</button>
        <button class="btn-secondary" onclick="state.selectedDate=todayStr(); renderDailyView()">Today</button>
      </div>
      <p class="page-subtitle">${dateDisplay}</p>
    </div>
    
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Income</div>
        <div class="summary-amount positive">${fmt(totalIncome)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Expenses</div>
        <div class="summary-amount negative">${fmt(totalExpenses)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Net</div>
        <div class="summary-amount ${net >= 0 ? 'positive' : 'negative'}">${fmt(net)}</div>
      </div>
    </div>
    
    <div class="quick-entry">
      <div class="quick-entry-title">Quick Add Transaction</div>
      <div class="quick-entry-grid">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select id="quick-type" class="form-select" onchange="updateQuickForm()">
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="quick-category" class="form-select"></select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" id="quick-amount" class="form-input" step="0.01" placeholder="0.00">
        </div>
        <div class="form-group" id="quick-payment-group">
          <label class="form-label">Payment</label>
          <select id="quick-payment" class="form-select">
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Venmo">Venmo</option>
            <option value="Zelle">Zelle</option>
          </select>
        </div>
        <button class="btn-primary" onclick="quickAddTransaction()" style="align-self:end;">Add</button>
      </div>
    </div>
    
    <div class="card">
      <h3 style="font-size:18px; margin-bottom:16px;">Today's Transactions</h3>
      ${transactions.length === 0 ? '<p style="text-align:center; color:var(--text-muted); padding:40px;">No transactions yet</p>' : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Notes</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${t.type === 'INCOME' ? '💰 Income' : '💸 Expense'}</td>
                <td>${t.category || '—'}</td>
                <td style="font-weight:600; color:${t.type === 'INCOME' ? 'var(--success)' : 'var(--danger)'}">${t.type === 'INCOME' ? fmt((t.serviceAmount || 0) + (t.tipAmount || 0)) : fmt(t.amount || 0)}</td>
                <td>${t.paymentMethod || '—'}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.notes || '—'}</td>
                <td><button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="openEditTransactionModal('${t.id}')">Edit</button></td>
                <td><button class="btn-danger" style="padding:6px 12px; font-size:12px;" onclick="deleteTransaction('${t.id}')">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
  
  updateQuickForm();
}

function changeDate(days) {
  state.selectedDate = addDays(state.selectedDate, days);
  renderDailyView();
}

function updateQuickForm() {
  const typeEl = document.getElementById('quick-type');
  const categoryEl = document.getElementById('quick-category');
  const paymentGroup = document.getElementById('quick-payment-group');
  
  if (!typeEl || !categoryEl || !paymentGroup) return;
  
  const type = typeEl.value;
  
  if (!state.categories || !state.categories.INCOME || !state.categories.DAILY_EXPENSE) {
    console.error('Categories not loaded');
    return;
  }
  
  const categories = type === 'INCOME' ? state.categories.INCOME : state.categories.DAILY_EXPENSE;
  categoryEl.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  
  paymentGroup.style.display = type === 'INCOME' ? 'block' : 'none';
}

async function quickAddTransaction() {
  const type = document.getElementById('quick-type').value;
  const category = document.getElementById('quick-category').value;
  const amount = parseFloat(document.getElementById('quick-amount').value);
  const payment = document.getElementById('quick-payment').value;
  
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount');
    return;
  }
  
  const txn = {
    userId: currentUser.uid,
    date: state.selectedDate,
    type: type,
    category: category,
    createdAt: firebase.firestore.Timestamp.now()
  };
  
  if (type === 'INCOME') {
    txn.serviceAmount = amount;
    txn.tipAmount = 0;
    txn.paymentMethod = payment;
  } else {
    txn.amount = amount;
  }
  
  const docRef = await firestore.collection('users').doc(currentUser.uid).collection('transactions').add(txn);
  await db.transactions.put({ id: docRef.id, ...txn });
  
  document.getElementById('quick-amount').value = '';
  showToast('Transaction added');
  renderDailyView();
}

async function openEditTransactionModal(id) {
  const t = await db.transactions.get(id);
  if (!t) return;
  
  const isIncome = t.type === 'INCOME';
  const catKey = isIncome ? 'INCOME' : 'DAILY_EXPENSE';
  const catOptions = (state.categories[catKey] || [])
    .map(name => `<option value="${name}" ${name === t.category ? 'selected' : ''}>${name}</option>`)
    .join('');
  
  openModal(`
    <h2 class="modal-title">Edit Transaction</h2>
    <form onsubmit="saveEditTransaction('${id}'); return false;">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="edit-category" class="form-select" required>${catOptions}</select>
      </div>
      ${isIncome ? `
        <div class="form-group">
          <label class="form-label">Service Amount</label>
          <input type="number" id="edit-service" class="form-input" step="0.01" value="${t.serviceAmount || 0}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Tip Amount</label>
          <input type="number" id="edit-tip" class="form-input" step="0.01" value="${t.tipAmount || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Payment Method</label>
          <select id="edit-payment" class="form-select">
            <option value="Cash" ${t.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
            <option value="Card" ${t.paymentMethod === 'Card' ? 'selected' : ''}>Card</option>
            <option value="Venmo" ${t.paymentMethod === 'Venmo' ? 'selected' : ''}>Venmo</option>
            <option value="Zelle" ${t.paymentMethod === 'Zelle' ? 'selected' : ''}>Zelle</option>
          </select>
        </div>
      ` : `
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" id="edit-amount" class="form-input" step="0.01" value="${t.amount || 0}" required>
        </div>
      `}
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="edit-notes" class="form-input" value="${t.notes || ''}">
      </div>
      <div style="display:flex;gap:8px;margin-top:24px;">
        <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" style="flex:1;">Save</button>
      </div>
    </form>
  `);
}

async function saveEditTransaction(id) {
  const t = await db.transactions.get(id);
  if (!t) return;
  
  const isIncome = t.type === 'INCOME';
  const category = document.getElementById('edit-category').value;
  const notes = document.getElementById('edit-notes').value;
  
  const updates = { category, notes };
  
  if (isIncome) {
    updates.serviceAmount = parseFloat(document.getElementById('edit-service').value) || 0;
    updates.tipAmount = parseFloat(document.getElementById('edit-tip').value) || 0;
    updates.paymentMethod = document.getElementById('edit-payment').value;
  } else {
    updates.amount = parseFloat(document.getElementById('edit-amount').value) || 0;
  }
  
  await firestore.collection('users').doc(currentUser.uid).collection('transactions').doc(id).update(updates);
  await db.transactions.update(id, updates);
  
  closeModal();
  showToast('Transaction updated');
  renderDailyView();
}

async function deleteTransaction(id) {
  const t = await db.transactions.get(id);
  if (!t) return;
  
  const amount = t.type === 'INCOME' 
    ? fmt((t.serviceAmount || 0) + (t.tipAmount || 0))
    : fmt(t.amount || 0);
  const type = t.type === 'INCOME' ? 'income' : 'expense';
  
  const message = `Are you sure you want to delete this ${type}?\n\n${t.category || 'Entry'}: ${amount}\n\nThis cannot be undone.`;
  
  const confirmed = await confirmDialog(message, 'Confirm Delete');
  if (!confirmed) return;
  
  await firestore.collection('users').doc(currentUser.uid).collection('transactions').doc(id).delete();
  await db.transactions.delete(id);
  
  showToast('Transaction deleted');
  renderDailyView();
}


// ============================================================
// MONTHLY VIEW
// ============================================================

async function renderMonthlyView() {
  const content = document.getElementById('content');
  
  const expenses = await db.monthlyExpenses
    .where('year').equals(state.selectedYear)
    .where('month').equals(state.selectedMonth)
    .toArray();
  
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  const monthDisplay = `${monthName(state.selectedMonth)} ${state.selectedYear}`;
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Monthly Expenses</h2>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
        <button class="btn-secondary" onclick="changeMonth(-1)">← Prev</button>
        <select class="form-select" style="width:auto;" value="${state.selectedMonth}" onchange="state.selectedMonth=parseInt(this.value); renderMonthlyView()">
          ${Array.from({length:12}, (_,i) => i+1).map(m => 
            `<option value="${m}" ${m === state.selectedMonth ? 'selected' : ''}>${monthName(m)}</option>`
          ).join('')}
        </select>
        <select class="form-select" style="width:auto;" value="${state.selectedYear}" onchange="state.selectedYear=parseInt(this.value); renderMonthlyView()">
          ${[2023,2024,2025,2026,2027].map(y => 
            `<option value="${y}" ${y === state.selectedYear ? 'selected' : ''}>${y}</option>`
          ).join('')}
        </select>
        <button class="btn-secondary" onclick="changeMonth(1)">Next →</button>
        <button class="btn-secondary" onclick="goToCurrentMonth()">Current</button>
      </div>
      <p class="page-subtitle">${monthDisplay}</p>
    </div>
    
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Total Expenses</div>
        <div class="summary-amount negative">${fmt(total)}</div>
      </div>
    </div>
    
    <div class="quick-entry">
      <div class="quick-entry-title">Add Monthly Expense</div>
      <div class="quick-entry-grid" style="grid-template-columns: repeat(2, 1fr) auto;">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="monthly-category" class="form-select">
            ${(state.categories.MONTHLY_EXPENSE || []).map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" id="monthly-amount" class="form-input" step="0.01" placeholder="0.00">
        </div>
        <button class="btn-primary" onclick="addMonthlyExpense()" style="align-self:end;">Add</button>
      </div>
    </div>
    
    <div class="card">
      <h3 style="font-size:18px; margin-bottom:16px;">This Month's Expenses</h3>
      ${expenses.length === 0 ? '<p style="text-align:center; color:var(--text-muted); padding:40px;">No expenses yet</p>' : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Amount</th>
              <th>Notes</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${expenses.map(e => `
              <tr>
                <td>${e.category}</td>
                <td style="font-weight:600; color:var(--danger)">${fmt(e.amount)}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${e.notes || '—'}</td>
                <td><button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="openEditMonthlyExpenseModal('${e.id}')">Edit</button></td>
                <td><button class="btn-danger" style="padding:6px 12px; font-size:12px;" onclick="deleteMonthlyExpense('${e.id}')">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

function changeMonth(delta) {
  let m = state.selectedMonth + delta;
  let y = state.selectedYear;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  state.selectedMonth = m;
  state.selectedYear = y;
  renderMonthlyView();
}

function goToCurrentMonth() {
  const now = new Date();
  state.selectedMonth = now.getMonth() + 1;
  state.selectedYear = now.getFullYear();
  renderMonthlyView();
}

async function addMonthlyExpense() {
  const category = document.getElementById('monthly-category').value;
  const amount = parseFloat(document.getElementById('monthly-amount').value);
  
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount');
    return;
  }
  
  const expense = {
    userId: currentUser.uid,
    year: state.selectedYear,
    month: state.selectedMonth,
    category: category,
    amount: amount,
    createdAt: firebase.firestore.Timestamp.now()
  };
  
  const docRef = await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').add(expense);
  await db.monthlyExpenses.put({ id: docRef.id, ...expense });
  
  document.getElementById('monthly-amount').value = '';
  showToast('Expense added');
  renderMonthlyView();
}

async function openEditMonthlyExpenseModal(id) {
  const e = await db.monthlyExpenses.get(id);
  if (!e) return;
  
  const catOptions = (state.categories.MONTHLY_EXPENSE || [])
    .map(name => `<option value="${name}" ${name === e.category ? 'selected' : ''}>${name}</option>`)
    .join('');
  
  openModal(`
    <h2 class="modal-title">Edit Monthly Expense</h2>
    <form onsubmit="saveEditMonthlyExpense('${id}'); return false;">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="edit-exp-category" class="form-select" required>${catOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" id="edit-exp-amount" class="form-input" step="0.01" value="${e.amount || 0}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="edit-exp-notes" class="form-input" value="${e.notes || ''}">
      </div>
      <div style="display:flex;gap:8px;margin-top:24px;">
        <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" style="flex:1;">Save</button>
      </div>
    </form>
  `);
}

async function saveEditMonthlyExpense(id) {
  const updates = {
    category: document.getElementById('edit-exp-category').value,
    amount: parseFloat(document.getElementById('edit-exp-amount').value) || 0,
    notes: document.getElementById('edit-exp-notes').value
  };
  
  await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').doc(id).update(updates);
  await db.monthlyExpenses.update(id, updates);
  
  closeModal();
  showToast('Expense updated');
  renderMonthlyView();
}

async function deleteMonthlyExpense(id) {
  const e = await db.monthlyExpenses.get(id);
  if (!e) return;
  
  const message = `Are you sure you want to delete this monthly expense?\n\n${e.category}: ${fmt(e.amount)}\n${monthName(e.month)} ${e.year}\n\nThis cannot be undone.`;
  
  const confirmed = await confirmDialog(message, 'Confirm Delete');
  if (!confirmed) return;
  
  await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').doc(id).delete();
  await db.monthlyExpenses.delete(id);
  
  showToast('Expense deleted');
  renderMonthlyView();
}


// ============================================================
// REPORTS VIEW
// ============================================================

async function renderReportsView() {
  const content = document.getElementById('content');
  
  const reportTypes = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'category', label: 'By Category' }
  ];
  
  const tabs = reportTypes.map(r =>
    `<button class="tab-btn ${state.reportType === r.id ? 'active' : ''}" onclick="state.reportType='${r.id}'; renderReportsView()">
      ${r.label}
    </button>`
  ).join('');
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Reports</h2>
      <p class="page-subtitle">Analyze your salon performance</p>
    </div>
    <div class="card">
      <div class="report-tabs">${tabs}</div>
      <div id="report-content"></div>
    </div>
  `;
  
  await renderReportContent();
}

async function renderReportContent() {
  const el = document.getElementById('report-content');
  if (!el) return;
  
  switch(state.reportType) {
    case 'weekly': await renderWeeklyReport(el); break;
    case 'monthly': await renderMonthlyReport(el); break;
    case 'category': await renderCategoryReport(el); break;
  }
}

async function renderWeeklyReport(el) {
  const weekStart = getWeekStart(state.selectedDate);
  const dates = Array.from({length: 7}, (_, i) => addDays(weekStart, i));
  
  const allTxns = await db.transactions.toArray();
  const weekTxns = allTxns.filter(t => dates.includes(t.date));
  
  const dailyTotals = dates.map(date => {
    const dayTxns = weekTxns.filter(t => t.date === date);
    const income = dayTxns.filter(t => t.type === 'INCOME').reduce((s, t) => s + (t.serviceAmount||0) + (t.tipAmount||0), 0);
    const expense = dayTxns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + (t.amount||0), 0);
    return { date, income, expense, net: income - expense };
  });
  
  const totalIncome = dailyTotals.reduce((s, d) => s + d.income, 0);
  const totalExpense = dailyTotals.reduce((s, d) => s + d.expense, 0);
  const totalNet = totalIncome - totalExpense;
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <button class="btn-secondary" onclick="state.selectedDate=addDays(state.selectedDate,-7); renderReportsView()">← Prev Week</button>
        <span style="font-weight:600;">${new Date(weekStart+'T00:00:00').toLocaleDateString()} - ${new Date(dates[6]+'T00:00:00').toLocaleDateString()}</span>
        <button class="btn-secondary" onclick="state.selectedDate=addDays(state.selectedDate,7); renderReportsView()">Next Week →</button>
      </div>
      
      <div class="summary-grid" style="margin-bottom:24px;">
        <div class="summary-card">
          <div class="summary-label">Week Income</div>
          <div class="summary-amount positive">${fmt(totalIncome)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Week Expenses</div>
          <div class="summary-amount negative">${fmt(totalExpense)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Week Net</div>
          <div class="summary-amount ${totalNet >= 0 ? 'positive' : 'negative'}">${fmt(totalNet)}</div>
        </div>
      </div>
      
      <canvas id="weekly-chart" style="max-height:300px;"></canvas>
      
      <table class="data-table" style="margin-top:24px;">
        <thead>
          <tr>
            <th>Day</th>
            <th>Income</th>
            <th>Expenses</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          ${dailyTotals.map(d => {
            const dateObj = new Date(d.date + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            return `
              <tr>
                <td>${dayName}, ${dateObj.toLocaleDateString()}</td>
                <td style="color:var(--success)">${fmt(d.income)}</td>
                <td style="color:var(--danger)">${fmt(d.expense)}</td>
                <td style="font-weight:600;color:${d.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(d.net)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  // Draw Chart
  const ctx = document.getElementById('weekly-chart');
  if (ctx && window.Chart) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dailyTotals.map(d => {
          const dateObj = new Date(d.date + 'T00:00:00');
          return dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }),
        datasets: [
          {
            label: 'Income',
            data: dailyTotals.map(d => d.income),
            backgroundColor: 'rgba(45, 122, 76, 0.8)',
          },
          {
            label: 'Expenses',
            data: dailyTotals.map(d => d.expense),
            backgroundColor: 'rgba(193, 56, 56, 0.8)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
}

async function renderMonthlyReport(el) {
  const allTxns = await db.transactions.toArray();
  const monthTxns = allTxns.filter(t => {
    const [y, m] = t.date.split('-');
    return parseInt(y) === state.selectedYear && parseInt(m) === state.selectedMonth;
  });
  
  const income = monthTxns.filter(t => t.type === 'INCOME');
  const expenses = monthTxns.filter(t => t.type === 'EXPENSE');
  
  const totalIncome = income.reduce((s, t) => s + (t.serviceAmount||0) + (t.tipAmount||0), 0);
  const totalExpense = expenses.reduce((s, t) => s + (t.amount||0), 0);
  const totalNet = totalIncome - totalExpense;
  
  // Monthly expenses
  const monthlyExpenses = await db.monthlyExpenses
    .where('year').equals(state.selectedYear)
    .where('month').equals(state.selectedMonth)
    .toArray();
  const monthlyExpenseTotal = monthlyExpenses.reduce((s, e) => s + (e.amount||0), 0);
  
  const netAfterMonthly = totalNet - monthlyExpenseTotal;
  
  // Category breakdown
  const incomeByCategory = {};
  income.forEach(t => {
    const cat = t.category || 'Other';
    incomeByCategory[cat] = (incomeByCategory[cat] || 0) + (t.serviceAmount||0) + (t.tipAmount||0);
  });
  
  const expenseByCategory = {};
  expenses.forEach(t => {
    const cat = t.category || 'Other';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (t.amount||0);
  });
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <button class="btn-secondary" onclick="changeMonth(-1); renderReportsView()">← Prev</button>
        <select class="form-select" style="width:auto;" onchange="state.selectedMonth=parseInt(this.value); renderReportsView()">
          ${Array.from({length:12}, (_,i) => i+1).map(m => 
            `<option value="${m}" ${m === state.selectedMonth ? 'selected' : ''}>${monthName(m)}</option>`
          ).join('')}
        </select>
        <select class="form-select" style="width:auto;" onchange="state.selectedYear=parseInt(this.value); renderReportsView()">
          ${[2023,2024,2025,2026,2027].map(y => 
            `<option value="${y}" ${y === state.selectedYear ? 'selected' : ''}>${y}</option>`
          ).join('')}
        </select>
        <button class="btn-secondary" onclick="changeMonth(1); renderReportsView()">Next →</button>
      </div>
      
      <div class="summary-grid" style="margin-bottom:24px;">
        <div class="summary-card">
          <div class="summary-label">Total Income</div>
          <div class="summary-amount positive">${fmt(totalIncome)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Daily Expenses</div>
          <div class="summary-amount negative">${fmt(totalExpense)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Monthly Expenses</div>
          <div class="summary-amount negative">${fmt(monthlyExpenseTotal)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Net Profit</div>
          <div class="summary-amount ${netAfterMonthly >= 0 ? 'positive' : 'negative'}">${fmt(netAfterMonthly)}</div>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:24px;">
        <div>
          <h4 style="margin-bottom:12px;">Income by Category</h4>
          <canvas id="income-pie-chart" style="max-height:300px;"></canvas>
        </div>
        <div>
          <h4 style="margin-bottom:12px;">Expenses by Category</h4>
          <canvas id="expense-pie-chart" style="max-height:300px;"></canvas>
        </div>
      </div>
    </div>
  `;
  
  // Income Pie Chart
  const incomeCtx = document.getElementById('income-pie-chart');
  if (incomeCtx && window.Chart && Object.keys(incomeByCategory).length > 0) {
    new Chart(incomeCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(incomeByCategory),
        datasets: [{
          data: Object.values(incomeByCategory),
          backgroundColor: ['#2D7A4C', '#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true
      }
    });
  }
  
  // Expense Pie Chart
  const expenseCtx = document.getElementById('expense-pie-chart');
  if (expenseCtx && window.Chart && Object.keys(expenseByCategory).length > 0) {
    new Chart(expenseCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(expenseByCategory),
        datasets: [{
          data: Object.values(expenseByCategory),
          backgroundColor: ['#C13838', '#D32F2F', '#E57373', '#EF9A9A', '#FFCDD2', '#FFEBEE']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true
      }
    });
  }
}

async function renderCategoryReport(el) {
  const startDate = document.getElementById('cat-start')?.value || '2024-01-01';
  const endDate = document.getElementById('cat-end')?.value || todayStr();
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Start Date</label>
          <input type="date" id="cat-start" class="form-input" value="${startDate}" onchange="renderReportsView()">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">End Date</label>
          <input type="date" id="cat-end" class="form-input" value="${endDate}" onchange="renderReportsView()">
        </div>
      </div>
      <div id="cat-report-content">Loading...</div>
    </div>
  `;
  
  const allTxns = await db.transactions.toArray();
  const rangeTxns = allTxns.filter(t => t.date >= startDate && t.date <= endDate);
  
  const incomeByCategory = {};
  const expenseByCategory = {};
  
  rangeTxns.forEach(t => {
    const cat = t.category || 'Other';
    if (t.type === 'INCOME') {
      incomeByCategory[cat] = (incomeByCategory[cat] || 0) + (t.serviceAmount||0) + (t.tipAmount||0);
    } else {
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (t.amount||0);
    }
  });
  
  const totalIncome = Object.values(incomeByCategory).reduce((a,b) => a+b, 0);
  const totalExpense = Object.values(expenseByCategory).reduce((a,b) => a+b, 0);
  
  const catContent = document.getElementById('cat-report-content');
  if (catContent) {
    catContent.innerHTML = `
      <div class="summary-grid" style="margin-bottom:24px;">
        <div class="summary-card">
          <div class="summary-label">Total Income</div>
          <div class="summary-amount positive">${fmt(totalIncome)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Total Expenses</div>
          <div class="summary-amount negative">${fmt(totalExpense)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Net</div>
          <div class="summary-amount ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}">${fmt(totalIncome - totalExpense)}</div>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <div class="card">
          <h4 style="margin-bottom:16px;">Income by Category</h4>
          <table class="data-table">
            <thead><tr><th>Category</th><th>Amount</th><th>%</th></tr></thead>
            <tbody>
              ${Object.entries(incomeByCategory).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => `
                <tr>
                  <td>${cat}</td>
                  <td style="color:var(--success)">${fmt(amt)}</td>
                  <td>${totalIncome > 0 ? ((amt/totalIncome)*100).toFixed(1) : 0}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h4 style="margin-bottom:16px;">Expenses by Category</h4>
          <table class="data-table">
            <thead><tr><th>Category</th><th>Amount</th><th>%</th></tr></thead>
            <tbody>
              ${Object.entries(expenseByCategory).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => `
                <tr>
                  <td>${cat}</td>
                  <td style="color:var(--danger)">${fmt(amt)}</td>
                  <td>${totalExpense > 0 ? ((amt/totalExpense)*100).toFixed(1) : 0}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}


// ============================================================
// RENTERS VIEW
// ============================================================

async function renderRentersView() {
  const content = document.getElementById('content');
  const renters = await db.renters.toArray();
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Booth Renters</h2>
      <p class="page-subtitle">Manage your booth renters</p>
      <button class="btn-primary" style="margin-top:12px;" onclick="openAddRenterModal()">+ Add Renter</button>
    </div>
    
    <div class="card">
      ${renters.length === 0 ? '<p style="text-align:center; color:var(--text-muted); padding:40px;">No renters yet</p>' : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Weekly Rent</th>
              <th>Start Date</th>
              <th>Phone</th>
              <th>Notes</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${renters.map(r => `
              <tr>
                <td style="font-weight:600;">${r.name}</td>
                <td>${fmt(r.weeklyRent || 0)}</td>
                <td>${r.startDate || '—'}</td>
                <td>${r.phone || '—'}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;">${r.notes || '—'}</td>
                <td><button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="openEditRenterModal('${r.id}')">Edit</button></td>
                <td><button class="btn-danger" style="padding:6px 12px; font-size:12px;" onclick="deleteRenter('${r.id}')">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

function openAddRenterModal() {
  openModal(`
    <h2 class="modal-title">Add Booth Renter</h2>
    <form onsubmit="saveNewRenter(); return false;">
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" id="renter-name" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label">Weekly Rent</label>
        <input type="number" id="renter-rent" class="form-input" step="0.01" required>
      </div>
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input type="date" id="renter-start" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input type="tel" id="renter-phone" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="renter-notes" class="form-input">
      </div>
      <div style="display:flex;gap:8px;margin-top:24px;">
        <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" style="flex:1;">Add Renter</button>
      </div>
    </form>
  `);
}

async function saveNewRenter() {
  const renter = {
    userId: currentUser.uid,
    name: document.getElementById('renter-name').value,
    weeklyRent: parseFloat(document.getElementById('renter-rent').value) || 0,
    startDate: document.getElementById('renter-start').value,
    phone: document.getElementById('renter-phone').value,
    notes: document.getElementById('renter-notes').value,
    createdAt: firebase.firestore.Timestamp.now()
  };
  
  const docRef = await firestore.collection('users').doc(currentUser.uid).collection('renters').add(renter);
  await db.renters.put({ id: docRef.id, ...renter });
  
  closeModal();
  showToast('Renter added');
  renderRentersView();
}

async function openEditRenterModal(id) {
  const r = await db.renters.get(id);
  if (!r) return;
  
  openModal(`
    <h2 class="modal-title">Edit Renter</h2>
    <form onsubmit="saveEditRenter('${id}'); return false;">
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" id="edit-renter-name" class="form-input" value="${r.name}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Weekly Rent</label>
        <input type="number" id="edit-renter-rent" class="form-input" step="0.01" value="${r.weeklyRent || 0}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input type="date" id="edit-renter-start" class="form-input" value="${r.startDate || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input type="tel" id="edit-renter-phone" class="form-input" value="${r.phone || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="edit-renter-notes" class="form-input" value="${r.notes || ''}">
      </div>
      <div style="display:flex;gap:8px;margin-top:24px;">
        <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" style="flex:1;">Save</button>
      </div>
    </form>
  `);
}

async function saveEditRenter(id) {
  const updates = {
    name: document.getElementById('edit-renter-name').value,
    weeklyRent: parseFloat(document.getElementById('edit-renter-rent').value) || 0,
    startDate: document.getElementById('edit-renter-start').value,
    phone: document.getElementById('edit-renter-phone').value,
    notes: document.getElementById('edit-renter-notes').value
  };
  
  await firestore.collection('users').doc(currentUser.uid).collection('renters').doc(id).update(updates);
  await db.renters.update(id, updates);
  
  closeModal();
  showToast('Renter updated');
  renderRentersView();
}

async function deleteRenter(id) {
  const r = await db.renters.get(id);
  if (!r) return;
  
  const message = `Are you sure you want to delete this renter?\n\n${r.name}\nWeekly Rent: ${fmt(r.weeklyRent || 0)}\n\nThis cannot be undone.`;
  
  const confirmed = await confirmDialog(message, 'Confirm Delete');
  if (!confirmed) return;
  
  await firestore.collection('users').doc(currentUser.uid).collection('renters').doc(id).delete();
  await db.renters.delete(id);
  
  showToast('Renter deleted');
  renderRentersView();
}


// ============================================================
// SETTINGS VIEW
// ============================================================

async function renderSettingsView() {
  const content = document.getElementById('content');
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Settings</h2>
      <p class="page-subtitle">Manage categories and preferences</p>
    </div>
    
    <div class="card">
      <h3 style="font-size:18px; margin-bottom:16px;">Income Categories</h3>
      <div id="income-categories" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
        ${state.categories.INCOME.map((cat, idx) => `
          <div class="category-tag">
            ${cat}
            <button onclick="removeCategory('INCOME', ${idx})" class="category-remove">×</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="new-income-cat" class="form-input" placeholder="New category name">
        <button class="btn-primary" onclick="addCategory('INCOME')">Add</button>
      </div>
    </div>
    
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:18px; margin-bottom:16px;">Daily Expense Categories</h3>
      <div id="expense-categories" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
        ${state.categories.DAILY_EXPENSE.map((cat, idx) => `
          <div class="category-tag">
            ${cat}
            <button onclick="removeCategory('DAILY_EXPENSE', ${idx})" class="category-remove">×</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="new-expense-cat" class="form-input" placeholder="New category name">
        <button class="btn-primary" onclick="addCategory('DAILY_EXPENSE')">Add</button>
      </div>
    </div>
    
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:18px; margin-bottom:16px;">Monthly Expense Categories</h3>
      <div id="monthly-expense-categories" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
        ${state.categories.MONTHLY_EXPENSE.map((cat, idx) => `
          <div class="category-tag">
            ${cat}
            <button onclick="removeCategory('MONTHLY_EXPENSE', ${idx})" class="category-remove">×</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="new-monthly-cat" class="form-input" placeholder="New category name">
        <button class="btn-primary" onclick="addCategory('MONTHLY_EXPENSE')">Add</button>
      </div>
    </div>
    
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:18px; margin-bottom:16px;">About</h3>
      <p style="margin-bottom:12px;">Mane Frame Salon - Desktop Edition</p>
      <p style="margin-bottom:12px;">Data syncs automatically with mobile app</p>
      <p style="color:var(--text-muted); font-size:14px;">Signed in as: ${currentUser?.email}</p>
    </div>
  `;
}

function addCategory(type) {
  let inputId;
  if (type === 'INCOME') inputId = 'new-income-cat';
  else if (type === 'DAILY_EXPENSE') inputId = 'new-expense-cat';
  else if (type === 'MONTHLY_EXPENSE') inputId = 'new-monthly-cat';
  
  const input = document.getElementById(inputId);
  const newCat = input.value.trim();
  
  if (!newCat) {
    showToast('Please enter a category name');
    return;
  }
  
  if (state.categories[type].includes(newCat)) {
    showToast('Category already exists');
    return;
  }
  
  state.categories[type].push(newCat);
  saveCategories();
  input.value = '';
  renderSettingsView();
}

function removeCategory(type, index) {
  if (!confirm('Remove this category?')) return;
  
  state.categories[type].splice(index, 1);
  saveCategories();
  renderSettingsView();
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', (e) => {
  // Ignore if typing in input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }
  
  // Ctrl/Cmd+I - Quick add income
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    if (state.currentView === 'daily') {
      document.getElementById('quick-type').value = 'INCOME';
      updateQuickForm();
      document.getElementById('quick-amount').focus();
    }
  }
  
  // Ctrl/Cmd+E - Quick add expense
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    if (state.currentView === 'daily') {
      document.getElementById('quick-type').value = 'EXPENSE';
      updateQuickForm();
      document.getElementById('quick-amount').focus();
    }
  }
  
  // Ctrl/Cmd+D - Navigate to Daily
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    navigate('daily');
  }
  
  // Ctrl/Cmd+M - Navigate to Monthly
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
    e.preventDefault();
    navigate('monthly');
  }
  
  // Ctrl/Cmd+R - Navigate to Reports
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    navigate('reports');
  }
});

console.log('Mane Frame Salon Desktop (Full Featured) - Ready');
console.log('Keyboard Shortcuts:');
console.log('  Ctrl+I = Add Income');
console.log('  Ctrl+E = Add Expense');
console.log('  Ctrl+D = Daily View');
console.log('  Ctrl+M = Monthly View');
console.log('  Ctrl+R = Reports View');
