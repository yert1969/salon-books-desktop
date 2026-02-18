// ============================================================
// MANE FRAME SALON - DESKTOP APP
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

// Enable offline persistence
firestore.enablePersistence().catch(err => {
  console.log('Offline persistence error:', err);
});

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
  categories: {}
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

function fmt(num) {
  return '$' + Number(num).toFixed(2);
}

function monthName(m) {
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

// ============================================================
// AUTHENTICATION
// ============================================================

auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('header-date').textContent = new Date().toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    
    await syncFromFirestore();
    await loadCategories();
    navigate('daily');
  } else {
    currentUser = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
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
  
  // Sync transactions
  const txnSnapshot = await firestore.collection('users').doc(uid).collection('transactions').get();
  for (const doc of txnSnapshot.docs) {
    await db.transactions.put({ id: doc.id, userId: uid, ...doc.data() });
  }
  
  // Sync monthly expenses
  const expSnapshot = await firestore.collection('users').doc(uid).collection('monthlyExpenses').get();
  for (const doc of expSnapshot.docs) {
    await db.monthlyExpenses.put({ id: doc.id, userId: uid, ...doc.data() });
  }
  
  // Sync renters
  const renterSnapshot = await firestore.collection('users').doc(uid).collection('renters').get();
  for (const doc of renterSnapshot.docs) {
    await db.renters.put({ id: doc.id, userId: uid, ...doc.data() });
  }
}

async function loadCategories() {
  if (!currentUser) return;
  
  const doc = await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').get();
  if (doc.exists) {
    state.categories = doc.data();
  } else {
    // Default categories
    state.categories = {
      INCOME: ['Haircut', 'Color', 'Highlights', 'Perm', 'Extensions', 'Treatment', 'Blowout', 'Styling', 'Other'],
      DAILY_EXPENSE: ['Products', 'Supplies', 'Lunch', 'Gas', 'Parking', 'Other'],
      MONTHLY_EXPENSE: ['Booth Rent', 'Insurance', 'License Renewal', 'Marketing', 'Equipment', 'Other']
    };
  }
}

// ============================================================
// NAVIGATION
// ============================================================

function navigate(view) {
  state.currentView = view;
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  
  // Render view
  switch(view) {
    case 'daily': renderDailyView(); break;
    case 'monthly': renderMonthlyView(); break;
    case 'renters': renderRentersView(); break;
    case 'reports': renderReportsView(); break;
    case 'settings': renderSettingsView(); break;
  }
}

// ============================================================
// DAILY VIEW
// ============================================================

async function renderDailyView() {
  const content = document.getElementById('content');
  
  const transactions = await db.transactions
    .where('date').equals(state.selectedDate)
    .toArray();
  
  const income = transactions.filter(t => t.type === 'INCOME');
  const expenses = transactions.filter(t => t.type === 'EXPENSE');
  
  const totalIncome = income.reduce((sum, t) => sum + (t.serviceAmount || 0) + (t.tipAmount || 0), 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + (t.amount || 0), 0);
  const net = totalIncome - totalExpenses;
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Daily Log</h2>
      <p class="page-subtitle">${new Date(state.selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
      ${transactions.length === 0 ? '<p style="text-align:center; color:var(--text-muted);">No transactions yet</p>' : `
        <table class="data-table">
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
            ${transactions.map(t => `
              <tr>
                <td>${t.type === 'INCOME' ? '💰 Income' : '💸 Expense'}</td>
                <td>${t.category || '—'}</td>
                <td style="font-weight:600; color:${t.type === 'INCOME' ? 'var(--success)' : 'var(--danger)'}">${t.type === 'INCOME' ? fmt((t.serviceAmount || 0) + (t.tipAmount || 0)) : fmt(t.amount || 0)}</td>
                <td>${t.paymentMethod || '—'}</td>
                <td>${t.notes || '—'}</td>
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

function updateQuickForm() {
  const type = document.getElementById('quick-type').value;
  const categorySelect = document.getElementById('quick-category');
  const paymentGroup = document.getElementById('quick-payment-group');
  
  const categories = type === 'INCOME' ? state.categories.INCOME : state.categories.DAILY_EXPENSE;
  categorySelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  
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

async function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  
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
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Monthly Expenses</h2>
      <p class="page-subtitle">${monthName(state.selectedMonth)} ${state.selectedYear}</p>
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
      ${expenses.length === 0 ? '<p style="text-align:center; color:var(--text-muted);">No expenses yet</p>' : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Amount</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${expenses.map(e => `
              <tr>
                <td>${e.category}</td>
                <td style="font-weight:600; color:var(--danger)">${fmt(e.amount)}</td>
                <td>${e.notes || '—'}</td>
                <td><button class="btn-danger" style="padding:6px 12px; font-size:12px;" onclick="deleteMonthlyExpense('${e.id}')">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
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

async function deleteMonthlyExpense(id) {
  if (!confirm('Delete this expense?')) return;
  
  await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').doc(id).delete();
  await db.monthlyExpenses.delete(id);
  
  showToast('Expense deleted');
  renderMonthlyView();
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
    </div>
    
    <div class="card">
      ${renters.length === 0 ? '<p style="text-align:center; color:var(--text-muted);">No renters yet. Use the mobile app to add renters.</p>' : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Weekly Rent</th>
              <th>Start Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${renters.map(r => `
              <tr>
                <td style="font-weight:600;">${r.name}</td>
                <td>${fmt(r.weeklyRent || 0)}</td>
                <td>${r.startDate || '—'}</td>
                <td><span style="color:var(--success); font-weight:600;">Active</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

// ============================================================
// REPORTS VIEW
// ============================================================

async function renderReportsView() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Reports</h2>
      <p class="page-subtitle">View detailed reports on the mobile app</p>
    </div>
    
    <div class="card">
      <p style="color:var(--text-muted); text-align:center; padding:40px;">
        Reports with charts and detailed analytics are available on the mobile app.<br>
        Use this desktop interface for quick data entry.
      </p>
    </div>
  `;
}

// ============================================================
// SETTINGS VIEW
// ============================================================

async function renderSettingsView() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Settings</h2>
      <p class="page-subtitle">App preferences and data management</p>
    </div>
    
    <div class="card">
      <h3 style="font-size:18px; margin-bottom:16px;">About This App</h3>
      <p style="margin-bottom:12px;">This is the desktop companion to the Mane Frame Salon mobile app.</p>
      <p style="margin-bottom:12px;">Your data automatically syncs between mobile and desktop.</p>
      <p style="color:var(--text-muted); font-size:14px;">To manage categories and other settings, use the mobile app.</p>
    </div>
  `;
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', (e) => {
  // Ctrl+I or Cmd+I - Quick add income
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
    e.preventDefault();
    if (state.currentView === 'daily') {
      document.getElementById('quick-type').value = 'INCOME';
      updateQuickForm();
      document.getElementById('quick-amount').focus();
    }
  }
  
  // Ctrl+E or Cmd+E - Quick add expense
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    if (state.currentView === 'daily') {
      document.getElementById('quick-type').value = 'EXPENSE';
      updateQuickForm();
      document.getElementById('quick-amount').focus();
    }
  }
});

console.log('Mane Frame Salon Desktop - Ready');
