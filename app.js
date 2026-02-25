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

// Version 2: Add rentPayments and dailySummary for booth rent tracking
db.version(2).stores({
  transactions: 'id, userId, date, type, category',
  monthlyExpenses: 'id, userId, year, month, category',
  renters: 'id, userId, name',
  rentPayments: 'id, userId, datePaid, weekStart, renterId',
  dailySummary: 'id, userId, date',
  categories: 'id, userId, type'
});

// Global State
let currentUser = null;
let state = {
  currentView: 'entries',
  selectedDate: todayStr(),
  selectedMonth: new Date().getMonth() + 1,
  selectedYear: new Date().getFullYear(),
  reportType: 'weekly',
  rentersWeekStart: null,
  entriesViewMode: 'daily', // 'daily', 'monthly', or 'all'
  entriesPage: 1,
  categories: {
    INCOME: ['Haircut', 'Color', 'Highlights', 'Blowout', 'Treatment', 'Nails', 'Waxing', 'Other'],
    EXPENSE: ['Supplies', 'Products', 'Tools/Equipment', 'Advertising', 'Education', 'Meals', 'Rent', 'Electric', 'Water', 'Gas', 'Insurance', 'Phone', 'Other']
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

// Helper to ensure date input always shows correct local date
function ensureLocalDate(dateStr) {
  if (!dateStr) return todayStr();
  // If dateStr is valid YYYY-MM-DD, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // Otherwise return today
  return todayStr();
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
  // Start week on Monday (day 1)
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

// Renters helper functions
function getWeekDue(weekStart) {
  return addDays(weekStart, 5); // Saturday
}

function nextWeekStart(ws) {
  return addDays(ws, 7);
}

function prevWeekStart(ws) {
  return addDays(ws, -7);
}

function formatWeekRange(ws) {
  const end = addDays(ws, 6);
  const s = new Date(ws + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts = { month: 'short', day: 'numeric' };
  return s.toLocaleDateString('en-US', opts) + ' – ' + e.toLocaleDateString('en-US', opts);
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function getRentStatus(weekStart, datePaid) {
  if (!datePaid) return 'unpaid';
  const due = new Date(getWeekDue(weekStart) + 'T23:59:59');
  const paid = new Date(datePaid + 'T00:00:00');
  return paid <= due ? 'ontime' : 'late';
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
    await navigate('entries');
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
    
    // Sync rent payments
    const rentPaymentsSnapshot = await firestore.collection('users').doc(uid).collection('rentPayments').get();
    for (const doc of rentPaymentsSnapshot.docs) {
      await db.rentPayments.put({ id: doc.id, userId: uid, ...doc.data() });
    }
    console.log(`Synced ${rentPaymentsSnapshot.docs.length} rent payments`);
    
    // Sync daily summaries
    const dailySummarySnapshot = await firestore.collection('users').doc(uid).collection('dailySummary').get();
    for (const doc of dailySummarySnapshot.docs) {
      await db.dailySummary.put({ id: doc.id, userId: uid, ...doc.data() });
    }
    console.log(`Synced ${dailySummarySnapshot.docs.length} daily summaries`);
  } catch (err) {
    console.error('Sync error:', err);
  }
}

async function loadCategories() {
  if (!currentUser) return;
  
  try {
    console.log('=== Loading categories from Firebase ===');
    console.log('User ID:', currentUser.uid);
    console.log('Path: users/' + currentUser.uid + '/settings/categories');
    
    const doc = await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').get();
    
    console.log('Document exists?', doc.exists);
    
    if (doc.exists) {
      const firestoreCategories = doc.data();
      console.log('Firebase raw data:', JSON.parse(JSON.stringify(firestoreCategories)));
      console.log('Firebase data keys:', Object.keys(firestoreCategories));
      
      // Check what fields actually exist
      console.log('Has INCOME field?', firestoreCategories.hasOwnProperty('INCOME'));
      console.log('Has EXPENSE field?', firestoreCategories.hasOwnProperty('EXPENSE'));
      console.log('Has DAILY_EXPENSE field?', firestoreCategories.hasOwnProperty('DAILY_EXPENSE'));
      console.log('Has MONTHLY_EXPENSE field?', firestoreCategories.hasOwnProperty('MONTHLY_EXPENSE'));
      
      // PRIORITY: Check if old format exists (DAILY_EXPENSE or MONTHLY_EXPENSE)
      // Even if EXPENSE exists, if old format exists, we need to re-merge to ensure completeness
      if (firestoreCategories.DAILY_EXPENSE || firestoreCategories.MONTHLY_EXPENSE) {
        console.log('⚠️ OLD FORMAT DETECTED - Migrating to unified EXPENSE format');
        
        // Merge DAILY_EXPENSE and MONTHLY_EXPENSE into EXPENSE
        const dailyExpenses = firestoreCategories.DAILY_EXPENSE || [];
        const monthlyExpenses = firestoreCategories.MONTHLY_EXPENSE || [];
        console.log('DAILY_EXPENSE:', dailyExpenses);
        console.log('MONTHLY_EXPENSE:', monthlyExpenses);
        
        const mergedExpenses = [...new Set([...dailyExpenses, ...monthlyExpenses])]; // Remove duplicates
        console.log('Merged EXPENSE:', mergedExpenses, 'Count:', mergedExpenses.length);
        
        state.categories = {
          INCOME: firestoreCategories.INCOME && firestoreCategories.INCOME.length > 0 
            ? firestoreCategories.INCOME 
            : state.categories.INCOME,
          EXPENSE: mergedExpenses.length > 0 ? mergedExpenses : state.categories.EXPENSE
        };
        
        // Save merged format back to Firebase (this will remove old fields)
        console.log('💾 Saving migrated categories to Firebase...');
        await saveCategories();
        console.log('✓ Migration complete!');
      } else if (firestoreCategories.EXPENSE) {
        // New unified format only (no old format fields)
        console.log('✓ New format detected (unified EXPENSE only)');
        console.log('EXPENSE array length:', firestoreCategories.EXPENSE.length);
        console.log('EXPENSE contents:', firestoreCategories.EXPENSE);
        
        state.categories = {
          INCOME: firestoreCategories.INCOME && firestoreCategories.INCOME.length > 0 
            ? firestoreCategories.INCOME 
            : state.categories.INCOME,
          EXPENSE: firestoreCategories.EXPENSE && firestoreCategories.EXPENSE.length > 0 
            ? firestoreCategories.EXPENSE 
            : state.categories.EXPENSE
        };
      } else if (firestoreCategories.INCOME) {
        // Has INCOME but no EXPENSE fields at all
        console.log('⚠️ Has INCOME but missing EXPENSE - using defaults for EXPENSE');
        state.categories.INCOME = firestoreCategories.INCOME;
        // Keep default EXPENSE
      } else {
        // No recognizable fields
        console.log('⚠️ No recognizable category fields found');
      }
      
      console.log('Final state.categories:', JSON.parse(JSON.stringify(state.categories)));
      console.log('INCOME count:', state.categories.INCOME?.length);
      console.log('EXPENSE count:', state.categories.EXPENSE?.length);
    } else {
      console.log('⚠️ No categories document in Firebase, saving defaults');
      await saveCategories();
    }
    
    // Set up real-time listener for category changes
    setupCategoryListener();
  } catch (err) {
    console.error('❌ Category load error:', err);
  }
}

// Real-time category sync listener
let categoryUnsubscribe = null;

function setupCategoryListener() {
  if (!currentUser) return;
  
  // Unsubscribe from previous listener if exists
  if (categoryUnsubscribe) {
    categoryUnsubscribe();
  }
  
  // Listen for category changes in Firebase
  categoryUnsubscribe = firestore.collection('users')
    .doc(currentUser.uid)
    .collection('settings')
    .doc('categories')
    .onSnapshot((doc) => {
      if (doc.exists) {
        const firestoreCategories = doc.data();
        console.log('Categories updated in Firebase, syncing...');
        
        // Support both formats
        if (firestoreCategories.EXPENSE) {
          state.categories = {
            INCOME: firestoreCategories.INCOME || state.categories.INCOME,
            EXPENSE: firestoreCategories.EXPENSE || state.categories.EXPENSE
          };
        } else {
          // Merge old format
          const dailyExpenses = firestoreCategories.DAILY_EXPENSE || [];
          const monthlyExpenses = firestoreCategories.MONTHLY_EXPENSE || [];
          const mergedExpenses = [...new Set([...dailyExpenses, ...monthlyExpenses])];
          
          state.categories = {
            INCOME: firestoreCategories.INCOME || state.categories.INCOME,
            EXPENSE: mergedExpenses.length > 0 ? mergedExpenses : state.categories.EXPENSE
          };
        }
        
        // Re-render current view to show updated categories
        navigate(state.currentView);
      }
    }, (error) => {
      console.error('Category listener error:', error);
    });
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

async function navigate(view) {
  console.log('Navigating to:', view);
  state.currentView = view;
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const navBtn = document.querySelector(`[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add('active');
  
  try {
    switch(view) {
      case 'entries': await renderEntriesView(); break;
      case 'renters': await renderRentersView(); break;
      case 'reports': await renderReportsView(); break;
      case 'settings': await renderSettingsView(); break;
    }
    console.log('View rendered:', view);
  } catch (err) {
    console.error('Render error:', err);
    document.getElementById('content').innerHTML = `
      <div class="card" style="text-align:center; padding:40px;">
        <h2 style="color:var(--danger);">Error Loading View</h2>
        <p>${err.message}</p>
        <p style="color:var(--text-muted);font-size:12px;">${err.stack}</p>
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
  const isToday = state.selectedDate === todayStr();
  
  // Calculate comparison stats (only for today)
  let comparisonHTML = '';
  if (isToday) {
    const allTxns = await db.transactions.toArray();
    
    // Yesterday
    const yesterday = addDays(todayStr(), -1);
    const yesterdayIncome = allTxns
      .filter(t => t.date === yesterday && t.type === 'INCOME')
      .reduce((s, t) => s + (t.serviceAmount || 0) + (t.tipAmount || 0), 0);
    
    // Last Week (same day of week)
    const lastWeek = addDays(todayStr(), -7);
    const lastWeekIncome = allTxns
      .filter(t => t.date === lastWeek && t.type === 'INCOME')
      .reduce((s, t) => s + (t.serviceAmount || 0) + (t.tipAmount || 0), 0);
    
    // Calculate percentage changes
    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    
    const vsYesterday = calcChange(totalIncome, yesterdayIncome);
    const vsLastWeek = calcChange(totalIncome, lastWeekIncome);
    
    const formatChange = (change, prevAmount) => {
      if (prevAmount === 0 && change === 0) {
        return '<span style="color:var(--text-muted); font-size:14px;">No data</span>';
      }
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      const color = change > 0 ? '#2D7A4C' : change < 0 ? '#C13838' : '#999';
      const percent = Math.abs(change).toFixed(0);
      return `
        <div style="color:${color}; font-size:20px; font-weight:600;">
          <span>${arrow}</span> <span>${percent}%</span>
        </div>
      `;
    };
    
    // Get day of week for label
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDayOfWeek = new Date().getDay();
    const dayName = dayNames[todayDayOfWeek];
    
    comparisonHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:24px;">
        <div class="summary-card">
          <div class="summary-label">vs Yesterday</div>
          ${formatChange(vsYesterday, yesterdayIncome)}
          <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">${fmt(yesterdayIncome)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">vs Last ${dayName}</div>
          ${formatChange(vsLastWeek, lastWeekIncome)}
          <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">${fmt(lastWeekIncome)}</div>
        </div>
      </div>
    `;
  }
  
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
    
    ${comparisonHTML}
    
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
  
  // TIMEZONE FIX: Ensure we always use a valid local date
  const date = ensureLocalDate(state.selectedDate);
  
  const txn = {
    userId: currentUser.uid,
    date: date,
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
        <label class="form-label">Date</label>
        <input type="date" id="edit-date" class="form-input" value="${t.date}" required>
      </div>
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
  let date = document.getElementById('edit-date').value;
  const category = document.getElementById('edit-category').value;
  const notes = document.getElementById('edit-notes').value;
  
  // TIMEZONE FIX: Ensure date is valid
  date = ensureLocalDate(date);
  
  const updates = { date, category, notes };
  
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
  
  try {
    console.log('Rendering monthly view:', state.selectedMonth, state.selectedYear);
    
    // Get all expenses and filter in JavaScript (Dexie doesn't support multiple where clauses)
    const allExpenses = await db.monthlyExpenses.toArray();
    const expenses = allExpenses.filter(e => 
      e.year === state.selectedYear && 
      e.month === state.selectedMonth
    );
    
    console.log('Loaded expenses:', expenses.length);
    
    const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const monthDisplay = `${monthName(state.selectedMonth)} ${state.selectedYear}`;
    
    // Check if viewing current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const isCurrentMonth = (state.selectedMonth === currentMonth && state.selectedYear === currentYear);
    
    // Calculate comparison stats (only for current month)
    let comparisonHTML = '';
    if (isCurrentMonth) {
      // Last month
      let lastMonth = currentMonth - 1;
      let lastMonthYear = currentYear;
      if (lastMonth < 1) { lastMonth = 12; lastMonthYear--; }
      
      const lastMonthExpenses = allExpenses.filter(e => 
        e.year === lastMonthYear && e.month === lastMonth
      );
      const lastMonthTotal = lastMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      
      // Same month last year
      const lastYearMonth = currentMonth;
      const lastYear = currentYear - 1;
      
      const lastYearExpenses = allExpenses.filter(e => 
        e.year === lastYear && e.month === lastYearMonth
      );
      const lastYearTotal = lastYearExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      
      // Calculate percentage changes
      const calcChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };
      
      const vsLastMonth = calcChange(total, lastMonthTotal);
      const vsLastYear = calcChange(total, lastYearTotal);
      
      const formatChange = (change, prevAmount) => {
        if (prevAmount === 0 && change === 0) {
          return '<span style="color:var(--text-muted); font-size:14px;">No data</span>';
        }
        const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
        // Note: For expenses, higher is worse, but we'll keep consistent coloring
        const color = change > 0 ? '#C13838' : change < 0 ? '#2D7A4C' : '#999';
        const percent = Math.abs(change).toFixed(0);
        return `
          <div style="color:${color}; font-size:20px; font-weight:600;">
            <span>${arrow}</span> <span>${percent}%</span>
          </div>
        `;
      };
      
      comparisonHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:24px;">
          <div class="summary-card">
            <div class="summary-label">vs Last Month</div>
            ${formatChange(vsLastMonth, lastMonthTotal)}
            <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">${monthName(lastMonth)}: ${fmt(lastMonthTotal)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">vs Last ${monthName(lastYearMonth)}</div>
            ${formatChange(vsLastYear, lastYearTotal)}
            <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">${lastYear}: ${fmt(lastYearTotal)}</div>
          </div>
        </div>
      `;
    }
    
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
    
    ${comparisonHTML}
    
    <div class="quick-entry">
      <div class="quick-entry-title">Add Monthly Expense</div>
      <div class="quick-entry-grid" style="grid-template-columns: repeat(2, 1fr) auto;">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select id="monthly-category" class="form-select">
            ${[...(state.categories.DAILY_EXPENSE || []), ...(state.categories.MONTHLY_EXPENSE || [])].map(c => `<option value="${c}">${c}</option>`).join('')}
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
  } catch (err) {
    console.error('Error rendering monthly view:', err);
    content.innerHTML = `
      <div class="card" style="text-align:center; padding:40px;">
        <h2 style="color:var(--danger);">Error Loading Monthly View</h2>
        <p>${err.message}</p>
        <button class="btn-primary" onclick="navigate('daily')">Go to Daily</button>
      </div>
    `;
  }
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
  
  const allExpenseCategories = [...(state.categories.DAILY_EXPENSE || []), ...(state.categories.MONTHLY_EXPENSE || [])];
  const catOptions = allExpenseCategories
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



// ============================================================
// ENTRIES VIEW (Unified Income/Expense Entry)
// ============================================================

async function renderEntriesView() {
  const content = document.getElementById('content');
  
  // Get current view mode from state
  const viewMode = state.entriesViewMode || 'daily';
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Entries</h2>
      <p class="page-subtitle">Add and manage all transactions</p>
    </div>
    
    <div class="card" style="max-width:600px; margin:0 auto 24px auto;">
      <h3 style="font-size:18px; margin-bottom:20px; font-weight:600;">Add Transaction</h3>
      
      <div class="form-group">
        <label class="form-label">Type</label>
        <div style="display:flex; gap:24px; margin-top:8px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="radio" name="entry-type" value="INCOME" checked onchange="updateEntryForm()" style="width:18px; height:18px; cursor:pointer;">
            <span style="font-size:14px;">Income</span>
          </label>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="radio" name="entry-type" value="EXPENSE" onchange="updateEntryForm()" style="width:18px; height:18px; cursor:pointer;">
            <span style="font-size:14px;">Expense</span>
          </label>
        </div>
      </div>
      
      <div class="form-group hidden" id="frequency-section">
        <label class="form-label">Frequency</label>
        <div style="display:flex; gap:24px; margin-top:8px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="radio" name="entry-frequency" value="DAILY" checked onchange="updateEntryForm()" style="width:18px; height:18px; cursor:pointer;">
            <span style="font-size:14px;">Daily</span>
          </label>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="radio" name="entry-frequency" value="MONTHLY" onchange="updateEntryForm()" style="width:18px; height:18px; cursor:pointer;">
            <span style="font-size:14px;">Monthly</span>
          </label>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="entry-category" class="form-select"></select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" id="entry-amount" class="form-input" step="0.01" placeholder="0.00">
      </div>
      
      <div class="form-group" id="date-section">
        <label class="form-label">Date</label>
        <input type="date" id="entry-date" class="form-input" value="${state.selectedDate}">
      </div>
      
      <div class="form-group hidden" id="month-section">
        <label class="form-label">Month</label>
        <select id="entry-month" class="form-select">
          ${Array.from({length:12}, (_,i) => i+1).map(m => 
            `<option value="${m}" ${m === state.selectedMonth ? 'selected' : ''}>${monthName(m)}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="form-group hidden" id="year-section">
        <label class="form-label">Year</label>
        <select id="entry-year" class="form-select">
          ${[2023,2024,2025,2026,2027].map(y => 
            `<option value="${y}" ${y === state.selectedYear ? 'selected' : ''}>${y}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <input type="text" id="entry-notes" class="form-input" placeholder="Add any notes...">
      </div>
      
      <button class="btn-primary" onclick="saveEntryTransaction()" style="width:100%; margin-top:8px;">
        Add Entry
      </button>
    </div>
    
    <div class="card">
      <h3 style="font-size:18px; margin-bottom:20px; font-weight:600;">View Entries</h3>
      
      <div style="display:flex; gap:8px; margin-bottom:20px; border-bottom:2px solid var(--border);">
        <button class="view-tab ${viewMode === 'daily' ? 'active' : ''}" onclick="switchEntriesView('daily')" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid ${viewMode === 'daily' ? 'var(--plum)' : 'transparent'}; cursor:pointer; font-size:14px; font-weight:${viewMode === 'daily' ? '600' : '500'}; color:${viewMode === 'daily' ? 'var(--plum)' : 'var(--text-light)'}; margin-bottom:-2px;">
          Daily Entries
        </button>
        <button class="view-tab ${viewMode === 'monthly' ? 'active' : ''}" onclick="switchEntriesView('monthly')" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid ${viewMode === 'monthly' ? 'var(--plum)' : 'transparent'}; cursor:pointer; font-size:14px; font-weight:${viewMode === 'monthly' ? '600' : '500'}; color:${viewMode === 'monthly' ? 'var(--plum)' : 'var(--text-light)'}; margin-bottom:-2px;">
          Monthly Entries
        </button>
        <button class="view-tab ${viewMode === 'all' ? 'active' : ''}" onclick="switchEntriesView('all')" style="padding:10px 20px; background:none; border:none; border-bottom:3px solid ${viewMode === 'all' ? 'var(--plum)' : 'transparent'}; cursor:pointer; font-size:14px; font-weight:${viewMode === 'all' ? '600' : '500'}; color:${viewMode === 'all' ? 'var(--plum)' : 'var(--text-light)'}; margin-bottom:-2px;">
          All Entries
        </button>
      </div>
      
      <div id="entries-content"></div>
    </div>
  `;
  
  updateEntryForm();
  await renderEntriesContent();
}

function updateEntryForm() {
  const type = document.querySelector('input[name="entry-type"]:checked')?.value || 'INCOME';
  const frequency = document.querySelector('input[name="entry-frequency"]:checked')?.value || 'DAILY';
  
  const frequencySection = document.getElementById('frequency-section');
  const dateSection = document.getElementById('date-section');
  const monthSection = document.getElementById('month-section');
  const yearSection = document.getElementById('year-section');
  const categorySelect = document.getElementById('entry-category');
  
  // Show/hide frequency for expenses only
  if (type === 'EXPENSE') {
    frequencySection?.classList.remove('hidden');
  } else {
    frequencySection?.classList.add('hidden');
  }
  
  // Show date for income and daily expenses, show month/year for monthly expenses
  if (type === 'EXPENSE' && frequency === 'MONTHLY') {
    dateSection?.classList.add('hidden');
    monthSection?.classList.remove('hidden');
    yearSection?.classList.remove('hidden');
  } else {
    dateSection?.classList.remove('hidden');
    monthSection?.classList.add('hidden');
    yearSection?.classList.add('hidden');
  }
  
  // Update category dropdown
  if (categorySelect) {
    const categories = type === 'INCOME' ? state.categories.INCOME : state.categories.EXPENSE;
    categorySelect.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  }
}

async function saveEntryTransaction() {
  const type = document.querySelector('input[name="entry-type"]:checked')?.value;
  const frequency = document.querySelector('input[name="entry-frequency"]:checked')?.value || 'DAILY';
  const category = document.getElementById('entry-category')?.value;
  const amount = parseFloat(document.getElementById('entry-amount')?.value);
  const notes = document.getElementById('entry-notes')?.value.trim() || '';
  
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount');
    return;
  }
  
  try {
    if (type === 'INCOME') {
      // Save as income transaction
      const date = document.getElementById('entry-date').value;
      const transaction = {
        userId: currentUser.uid,
        date: date,
        type: 'INCOME',
        category: category,
        serviceAmount: amount,
        tipAmount: 0,
        notes: notes,
        createdAt: firebase.firestore.Timestamp.now()
      };
      
      const docRef = await firestore.collection('users').doc(currentUser.uid).collection('transactions').add(transaction);
      await db.transactions.add({ id: docRef.id, ...transaction });
      
    } else if (frequency === 'DAILY') {
      // Save as daily expense transaction
      const date = document.getElementById('entry-date').value;
      const transaction = {
        userId: currentUser.uid,
        date: date,
        type: 'EXPENSE',
        category: category,
        amount: amount,
        notes: notes,
        createdAt: firebase.firestore.Timestamp.now()
      };
      
      const docRef = await firestore.collection('users').doc(currentUser.uid).collection('transactions').add(transaction);
      await db.transactions.add({ id: docRef.id, ...transaction });
      
    } else {
      // Save as monthly expense
      const month = parseInt(document.getElementById('entry-month').value);
      const year = parseInt(document.getElementById('entry-year').value);
      
      const expense = {
        userId: currentUser.uid,
        year: year,
        month: month,
        category: category,
        amount: amount,
        notes: notes,
        createdAt: firebase.firestore.Timestamp.now()
      };
      
      const docRef = await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').add(expense);
      await db.monthlyExpenses.add({ id: docRef.id, ...expense });
    }
    
    // Clear form
    document.getElementById('entry-amount').value = '';
    document.getElementById('entry-notes').value = '';
    
    showToast('Entry added successfully');
    await renderEntriesContent();
    
  } catch (error) {
    console.error('Error saving entry:', error);
    showToast('Error saving entry');
  }
}

async function renderEntriesContent() {
  const viewMode = state.entriesViewMode || 'daily';
  const entriesContent = document.getElementById('entries-content');
  if (!entriesContent) return;
  
  if (viewMode === 'daily') {
    await renderDailyEntries(entriesContent);
  } else if (viewMode === 'monthly') {
    await renderMonthlyEntries(entriesContent);
  } else {
    await renderAllEntries(entriesContent);
  }
}

async function renderDailyEntries(container) {
  const dateObj = new Date(state.selectedDate + 'T00:00:00');
  const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:20px; padding:16px; background:var(--cream); border-radius:8px;">
      <button class="btn-secondary" onclick="changeEntriesDate(-1)">← Prev Day</button>
      <input type="date" class="form-input" style="width:auto;" value="${state.selectedDate}" onchange="state.selectedDate=this.value; renderEntriesContent()">
      <button class="btn-secondary" onclick="changeEntriesDate(1)">Next Day →</button>
      <button class="btn-secondary" onclick="state.selectedDate=todayStr(); renderEntriesContent()">Today</button>
    </div>
    <div id="daily-entries-list"></div>
  `;
  
  const transactions = await db.transactions.where('date').equals(state.selectedDate).toArray();
  const listEl = document.getElementById('daily-entries-list');
  
  if (transactions.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        <div style="font-size:48px; margin-bottom:16px; opacity:0.3;">📋</div>
        <div style="font-size:14px;">No entries for ${dateDisplay}</div>
      </div>
    `;
    return;
  }
  
  transactions.sort((a, b) => {
    const aTime = a.createdAt?.toDate?.() || new Date(0);
    const bTime = b.createdAt?.toDate?.() || new Date(0);
    return bTime - aTime;
  });
  
  listEl.innerHTML = transactions.map(t => {
    const isIncome = t.type === 'INCOME';
    const amount = isIncome ? (t.serviceAmount || 0) + (t.tipAmount || 0) : (t.amount || 0);
    const icon = isIncome ? '💰' : '💸';
    const amountClass = isIncome ? 'positive' : 'negative';
    const sign = isIncome ? '+' : '-';
    const subtitle = isIncome ? 'Income' : 'Daily Expense';
    
    return `
      <div class="entry-card" style="display:flex; align-items:center; gap:16px; padding:16px; background:white; border:1px solid var(--border); border-radius:8px; margin-bottom:12px;">
        <button onclick="deleteDailyEntry('${t.id}')" 
                style="background:none; border:none; font-size:20px; color:#C13838; cursor:pointer; padding:0; width:24px; height:24px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">✕</button>
        <span style="font-size:28px; flex-shrink:0;">${icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:15px; font-weight:600; margin-bottom:4px;">${t.category}</div>
          <div style="font-size:13px; color:var(--text-muted);">${subtitle}</div>
        </div>
        <div class="amount ${amountClass}" style="font-size:18px; font-weight:700; flex-shrink:0;">${sign}${fmt(amount)}</div>
      </div>
    `;
  }).join('');
}

async function renderMonthlyEntries(container) {
  const monthDisplay = `${monthName(state.selectedMonth)} ${state.selectedYear}`;
  
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:20px; padding:16px; background:var(--cream); border-radius:8px;">
      <button class="btn-secondary" onclick="changeEntriesMonth(-1)">← Prev Month</button>
      <div style="font-size:15px; font-weight:600; color:var(--text); min-width:200px; text-align:center;">${monthDisplay}</div>
      <button class="btn-secondary" onclick="changeEntriesMonth(1)">Next Month →</button>
      <button class="btn-secondary" onclick="goToCurrentEntriesMonth()">Current Month</button>
    </div>
    <div id="monthly-entries-list"></div>
  `;
  
  // Get date range for this month
  const year = state.selectedYear;
  const month = state.selectedMonth;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  // Get all transactions and filter by month
  const allTransactions = await db.transactions.toArray();
  const dailyTransactions = allTransactions.filter(t => 
    t.date >= startDate && t.date <= endDate
  );
  
  // Get monthly expenses for this month (no .and() method)
  const allMonthlyExpenses = await db.monthlyExpenses.toArray();
  const monthlyExpenses = allMonthlyExpenses.filter(e => 
    e.year === year && e.month === month
  );
  
  const listEl = document.getElementById('monthly-entries-list');
  
  if (dailyTransactions.length === 0 && monthlyExpenses.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        <div style="font-size:48px; margin-bottom:16px; opacity:0.3;">📋</div>
        <div style="font-size:14px;">No entries for ${monthDisplay}</div>
      </div>
    `;
    return;
  }
  
  // Combine and sort all entries
  const allEntries = [];
  
  // Add daily transactions
  dailyTransactions.forEach(t => {
    const isIncome = t.type === 'INCOME';
    const amount = isIncome ? (t.serviceAmount || 0) + (t.tipAmount || 0) : (t.amount || 0);
    allEntries.push({
      id: t.id,
      date: t.date,
      type: isIncome ? 'income' : 'daily-expense',
      category: t.category,
      amount: amount,
      isIncome: isIncome,
      sortDate: t.date,
      createdAt: t.createdAt
    });
  });
  
  // Add monthly expenses (show at top of month)
  monthlyExpenses.forEach(e => {
    allEntries.push({
      id: e.id,
      date: `${year}-${String(month).padStart(2, '0')}-01`,
      type: 'monthly-expense',
      category: e.category,
      amount: e.amount,
      isIncome: false,
      sortDate: `${year}-${String(month).padStart(2, '0')}-00`, // Sort before daily entries
      createdAt: e.createdAt
    });
  });
  
  // Sort by date (newest first)
  allEntries.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  
  listEl.innerHTML = allEntries.map(entry => {
    const icon = entry.type === 'income' ? '💰' : entry.type === 'monthly-expense' ? '🏠' : '💸';
    const amountClass = entry.isIncome ? 'positive' : 'negative';
    const sign = entry.isIncome ? '+' : '-';
    const typeLabel = entry.type === 'income' ? 'Income' : entry.type === 'monthly-expense' ? 'Monthly Expense' : 'Daily Expense';
    const dateDisplay = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    return `
      <div class="entry-card" style="display:flex; align-items:center; gap:16px; padding:16px; background:white; border:1px solid var(--border); border-radius:8px; margin-bottom:12px;">
        <button onclick="${entry.type === 'monthly-expense' ? 'deleteMonthlyExpenseEntry' : 'deleteDailyEntry'}('${entry.id}')" 
                style="background:none; border:none; font-size:20px; color:#C13838; cursor:pointer; padding:0; width:24px; height:24px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">✕</button>
        <span style="font-size:28px; flex-shrink:0;">${icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:15px; font-weight:600; margin-bottom:4px;">${entry.category}</div>
          <div style="font-size:13px; color:var(--text-muted);">${typeLabel} • ${dateDisplay}</div>
        </div>
        <div class="amount ${amountClass}" style="font-size:18px; font-weight:700; flex-shrink:0;">${sign}${fmt(entry.amount)}</div>
      </div>
    `;
  }).join('');
}

async function renderAllEntries(container) {
  container.innerHTML = `
    <div style="margin-bottom:16px; padding:12px; background:var(--cream); border-radius:8px; text-align:center;">
      <div style="font-size:14px; font-weight:600; color:var(--text);">All Transactions</div>
      <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Showing most recent 50</div>
    </div>
    <div id="all-entries-list"></div>
  `;
  
  // Get all transactions
  const dailyTransactions = await db.transactions.toArray();
  
  // Get all monthly expenses
  const monthlyExpenses = await db.monthlyExpenses.toArray();
  
  const listEl = document.getElementById('all-entries-list');
  
  if (dailyTransactions.length === 0 && monthlyExpenses.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        <div style="font-size:48px; margin-bottom:12px; opacity:0.3;">📋</div>
        <div style="font-size:14px;">No transactions yet</div>
      </div>
    `;
    return;
  }
  
  // Combine all entries
  const allEntries = [];
  
  // Add daily transactions
  dailyTransactions.forEach(t => {
    const isIncome = t.type === 'INCOME';
    const amount = isIncome ? (t.serviceAmount || 0) + (t.tipAmount || 0) : (t.amount || 0);
    allEntries.push({
      id: t.id,
      date: t.date,
      type: isIncome ? 'income' : 'daily-expense',
      category: t.category,
      amount: amount,
      isIncome: isIncome,
      sortDate: t.date,
      createdAt: t.createdAt
    });
  });
  
  // Add monthly expenses
  monthlyExpenses.forEach(e => {
    const dateStr = `${e.year}-${String(e.month).padStart(2, '0')}-01`;
    allEntries.push({
      id: e.id,
      date: dateStr,
      type: 'monthly-expense',
      category: e.category,
      amount: e.amount,
      isIncome: false,
      sortDate: dateStr,
      monthYear: `${monthName(e.month)} ${e.year}`,
      createdAt: e.createdAt
    });
  });
  
  // Sort by date (newest first)
  allEntries.sort((a, b) => {
    const dateCompare = b.sortDate.localeCompare(a.sortDate);
    if (dateCompare !== 0) return dateCompare;
    // If same date, sort by createdAt
    const aTime = a.createdAt?.toDate?.() || new Date(0);
    const bTime = b.createdAt?.toDate?.() || new Date(0);
    return bTime - aTime;
  });
  
  // Take only first 50
  const displayEntries = allEntries.slice(0, 50);
  
  listEl.innerHTML = displayEntries.map(entry => {
    const icon = entry.type === 'income' ? '💰' : entry.type === 'monthly-expense' ? '🏠' : '💸';
    const amountClass = entry.isIncome ? 'positive' : 'negative';
    const sign = entry.isIncome ? '+' : '-';
    const typeLabel = entry.type === 'income' ? 'Income' : entry.type === 'monthly-expense' ? 'Monthly Expense' : 'Daily Expense';
    const dateDisplay = entry.type === 'monthly-expense' 
      ? entry.monthYear
      : new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    return `
      <div class="entry-card" style="display:flex; align-items:center; gap:16px; padding:16px; background:white; border:1px solid var(--border); border-radius:8px; margin-bottom:12px;">
        <button onclick="${entry.type === 'monthly-expense' ? 'deleteMonthlyExpenseEntry' : 'deleteDailyEntry'}('${entry.id}')" 
                style="background:none; border:none; font-size:20px; color:#C13838; cursor:pointer; padding:0; width:24px; height:24px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">✕</button>
        <span style="font-size:28px; flex-shrink:0;">${icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:15px; font-weight:600; margin-bottom:4px;">${entry.category}</div>
          <div style="font-size:13px; color:var(--text-muted);">${typeLabel} • ${dateDisplay}</div>
        </div>
        <div class="amount ${amountClass}" style="font-size:18px; font-weight:700; flex-shrink:0;">${sign}${fmt(entry.amount)}</div>
      </div>
    `;
  }).join('');
}

function switchEntriesView(mode) {
  state.entriesViewMode = mode;
  renderEntriesView();
}

function changeEntriesDate(days) {
  state.selectedDate = addDays(state.selectedDate, days);
  renderEntriesContent();
}

function changeEntriesMonth(months) {
  let newMonth = state.selectedMonth + months;
  let newYear = state.selectedYear;
  
  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  } else if (newMonth < 1) {
    newMonth = 12;
    newYear--;
  }
  
  state.selectedMonth = newMonth;
  state.selectedYear = newYear;
  renderEntriesContent();
}

function goToCurrentEntriesMonth() {
  const now = new Date();
  state.selectedMonth = now.getMonth() + 1;
  state.selectedYear = now.getFullYear();
  renderEntriesContent();
}

async function editDailyEntry(id) {
  // Reuse existing edit logic from renderDailyView
  const transaction = await db.transactions.get(id);
  if (!transaction) return;
  
  // Open modal or inline edit - for now just show alert
  showToast('Edit functionality coming soon');
}

async function deleteDailyEntry(id) {
  const transaction = await db.transactions.get(id);
  if (!transaction) return;
  
  const isIncome = transaction.type === 'INCOME';
  const amount = isIncome ? (transaction.serviceAmount || 0) + (transaction.tipAmount || 0) : (transaction.amount || 0);
  
  const message = `Are you sure you want to delete this transaction?\\n\\n${transaction.category}: ${fmt(amount)}\\n${transaction.date}\\n\\nThis cannot be undone.`;
  
  const confirmed = await confirmDialog(message, 'Confirm Delete');
  if (!confirmed) return;
  
  await firestore.collection('users').doc(currentUser.uid).collection('transactions').doc(id).delete();
  await db.transactions.delete(id);
  
  showToast('Transaction deleted');
  renderEntriesContent();
}

async function editMonthlyExpenseEntry(id) {
  showToast('Edit functionality coming soon');
}

async function deleteMonthlyExpenseEntry(id) {
  const e = await db.monthlyExpenses.get(id);
  if (!e) return;
  
  const message = `Are you sure you want to delete this monthly expense?\\n\\n${e.category}: ${fmt(e.amount)}\\n${monthName(e.month)} ${e.year}\\n\\nThis cannot be undone.`;
  
  const confirmed = await confirmDialog(message, 'Confirm Delete');
  if (!confirmed) return;
  
  await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').doc(id).delete();
  await db.monthlyExpenses.delete(id);
  
  showToast('Expense deleted');
  renderEntriesContent();
}

async function renderReportsView() {
  const content = document.getElementById('content');
  
  const reportTypes = [
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'month-compare', label: 'Month Compare' },
    { id: 'date-compare', label: 'Date Range' },
    { id: 'annual', label: 'Annual' },
    { id: 'yoy', label: 'Year vs Year' },
    { id: 'category', label: 'By Category' },
    { id: 'export', label: '📥 Export' }
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
    case 'month-compare': await renderMonthCompareReport(el); break;
    case 'date-compare': await renderDateRangeCompareReport(el); break;
    case 'annual': await renderAnnualReport(el); break;
    case 'yoy': await renderYOYReport(el); break;
    case 'category': await renderCategoryReport(el); break;
    case 'export': await renderExportReport(el); break;
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
          y: { 
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toFixed(0);
              }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y || 0;
                return `${label}: $${value.toFixed(2)}`;
              }
            }
          }
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
  
  // Separate services and tips
  const serviceTotal = income.reduce((s, t) => s + (t.serviceAmount||0), 0);
  const tipTotal = income.reduce((s, t) => s + (t.tipAmount||0), 0);
  const totalExpense = expenses.reduce((s, t) => s + (t.amount||0), 0);
  const totalNet = serviceTotal + tipTotal - totalExpense;
  
  // Booth rent payments (income from renters)
  const allRentPayments = await db.rentPayments.toArray();
  const monthRentPayments = allRentPayments.filter(p => {
    if (!p.datePaid) return false;
    const [y, m] = p.datePaid.split('-');
    return parseInt(y) === state.selectedYear && parseInt(m) === state.selectedMonth;
  });
  const boothRentIncome = monthRentPayments.reduce((s, p) => s + (p.amount||0), 0);
  
  // Monthly expenses - Get all and filter (Dexie doesn't support chaining where clauses)
  const allMonthlyExpenses = await db.monthlyExpenses.toArray();
  const monthlyExpenses = allMonthlyExpenses.filter(e => 
    e.year === state.selectedYear && 
    e.month === state.selectedMonth
  );
  const monthlyExpenseTotal = monthlyExpenses.reduce((s, e) => s + (e.amount||0), 0);
  
  // Total income includes booth rent
  const totalIncome = serviceTotal + tipTotal + boothRentIncome;
  const netAfterMonthly = totalIncome - totalExpense - monthlyExpenseTotal;
  
  // Category breakdown
  const incomeByCategory = {};
  income.forEach(t => {
    const cat = t.category || 'Other';
    incomeByCategory[cat] = (incomeByCategory[cat] || 0) + (t.serviceAmount||0) + (t.tipAmount||0);
  });
  // Add booth rent income to the breakdown
  if (boothRentIncome > 0) {
    incomeByCategory['Booth Rent'] = (incomeByCategory['Booth Rent'] || 0) + boothRentIncome;
  }
  
  const expenseByCategory = {};
  // Add daily expenses
  expenses.forEach(t => {
    const cat = t.category || 'Other';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (t.amount||0);
  });
  // Add monthly expenses to the breakdown
  monthlyExpenses.forEach(e => {
    const cat = e.category || 'Other';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (e.amount||0);
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
      
      <!-- Calculation Flow Layout -->
      <div style="max-width:600px; margin:0 auto 24px auto;">
        <div style="background:var(--bg-secondary); border-radius:8px; padding:24px;">
          <h3 style="margin:0 0 20px 0; font-size:18px; color:var(--text); text-align:center;">Monthly Calculation</h3>
          
          <!-- Income Section -->
          <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(45, 122, 76, 0.1); border-radius:6px; margin-bottom:8px;">
              <span style="font-weight:600; color:var(--text);">Services</span>
              <span style="font-size:18px; font-weight:700; color:var(--success);">${fmt(serviceTotal)}</span>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(45, 122, 76, 0.1); border-radius:6px; margin-bottom:8px;">
              <span style="font-weight:600; color:var(--text);"><span style="color:var(--success); font-size:20px; margin-right:8px;">+</span>Tips</span>
              <span style="font-size:18px; font-weight:700; color:var(--success);">${fmt(tipTotal)}</span>
            </div>
            
            ${boothRentIncome > 0 ? `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(45, 122, 76, 0.1); border-radius:6px; margin-bottom:8px;">
              <span style="font-weight:600; color:var(--text);"><span style="color:var(--success); font-size:20px; margin-right:8px;">+</span>Booth Rent</span>
              <span style="font-size:18px; font-weight:700; color:var(--success);">${fmt(boothRentIncome)}</span>
            </div>
            ` : ''}
            
            <div style="border-top:3px solid var(--success); margin:12px 0; padding-top:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(45, 122, 76, 0.15); border-radius:6px; border:2px solid var(--success);">
                <span style="font-weight:700; color:var(--text); font-size:16px;"><span style="color:var(--success); font-size:20px; margin-right:8px;">=</span>Total Income</span>
                <span style="font-size:22px; font-weight:800; color:var(--success);">${fmt(totalIncome)}</span>
              </div>
            </div>
          </div>
          
          <!-- Expense Section -->
          <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(193, 56, 56, 0.1); border-radius:6px; margin-bottom:8px;">
              <span style="font-weight:600; color:var(--text);"><span style="color:var(--danger); font-size:20px; margin-right:8px;">−</span>Daily Expenses</span>
              <span style="font-size:18px; font-weight:700; color:var(--danger);">${fmt(totalExpense)}</span>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(193, 56, 56, 0.1); border-radius:6px; margin-bottom:8px;">
              <span style="font-weight:600; color:var(--text);"><span style="color:var(--danger); font-size:20px; margin-right:8px;">−</span>Monthly Expenses</span>
              <span style="font-size:18px; font-weight:700; color:var(--danger);">${fmt(monthlyExpenseTotal)}</span>
            </div>
            
            <div style="border-top:3px solid var(--success); margin:12px 0; padding-top:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:rgba(45, 122, 76, 0.2); border-radius:6px; border:3px solid var(--success);">
                <span style="font-weight:700; color:var(--text); font-size:18px;"><span style="color:var(--success); font-size:24px; margin-right:8px;">=</span>Net Profit</span>
                <span style="font-size:28px; font-weight:800; color:var(--success);">${fmt(netAfterMonthly)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:24px;">
        <div>
          <h4 style="margin-bottom:12px;">Income by Category</h4>
          <canvas id="income-pie-chart" style="max-height:300px;"></canvas>
          <div id="income-summary" style="margin-top:16px;"></div>
        </div>
        <div>
          <h4 style="margin-bottom:12px;">Expenses by Category</h4>
          <canvas id="expense-pie-chart" style="max-height:300px;"></canvas>
          <div id="expense-summary" style="margin-top:16px;"></div>
        </div>
      </div>
    </div>
  `;
  
  // Income Pie Chart
  const incomeCtx = document.getElementById('income-pie-chart');
  if (incomeCtx && window.Chart && Object.keys(incomeByCategory).length > 0) {
    const incomeColors = [
      '#2D7A4C', '#4A90E2', '#F5A623', '#7B68EE', '#50C878', '#FF6B6B',
      '#4ECDC4', '#FFD93D', '#C44569', '#6C5CE7', '#FD79A8', '#A29BFE'
    ];
    
    new Chart(incomeCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(incomeByCategory),
        datasets: [{
          data: Object.values(incomeByCategory),
          backgroundColor: incomeColors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${label}: $${value.toFixed(2)} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
    
    // Generate income summary table
    const incomeTotal = Object.values(incomeByCategory).reduce((a, b) => a + b, 0);
    const incomeSummary = document.getElementById('income-summary');
    if (incomeSummary) {
      const sortedIncome = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
      incomeSummary.innerHTML = `
        <table style="width:100%; font-size:13px; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid var(--border); text-align:left;">
              <th style="padding:8px 4px; font-weight:600; color:var(--text-muted);">Category</th>
              <th style="padding:8px 4px; font-weight:600; color:var(--text-muted); text-align:right;">Amount</th>
              <th style="padding:8px 4px; font-weight:600; color:var(--text-muted); text-align:right;">%</th>
            </tr>
          </thead>
          <tbody>
            ${sortedIncome.map(([category, amount], index) => {
              const percentage = incomeTotal > 0 ? ((amount / incomeTotal) * 100).toFixed(1) : 0;
              const color = incomeColors[index % incomeColors.length];
              return `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:8px 4px;">
                    <span style="display:inline-block; width:12px; height:12px; background:${color}; border-radius:2px; margin-right:8px; vertical-align:middle;"></span>
                    ${category}
                  </td>
                  <td style="padding:8px 4px; text-align:right; font-weight:600; color:var(--success);">${fmt(amount)}</td>
                  <td style="padding:8px 4px; text-align:right; color:var(--text-muted);">${percentage}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  }
  
  // Expense Pie Chart
  const expenseCtx = document.getElementById('expense-pie-chart');
  if (expenseCtx && window.Chart && Object.keys(expenseByCategory).length > 0) {
    const expenseColors = [
      '#E74C3C', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22',
      '#34495E', '#16A085', '#D35400', '#8E44AD', '#27AE60', '#2980B9'
    ];
    
    new Chart(expenseCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(expenseByCategory),
        datasets: [{
          data: Object.values(expenseByCategory),
          backgroundColor: expenseColors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${label}: $${value.toFixed(2)} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
    
    // Generate expense summary table
    const expenseTotal = Object.values(expenseByCategory).reduce((a, b) => a + b, 0);
    const expenseSummary = document.getElementById('expense-summary');
    if (expenseSummary) {
      const sortedExpense = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);
      expenseSummary.innerHTML = `
        <table style="width:100%; font-size:13px; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid var(--border); text-align:left;">
              <th style="padding:8px 4px; font-weight:600; color:var(--text-muted);">Category</th>
              <th style="padding:8px 4px; font-weight:600; color:var(--text-muted); text-align:right;">Amount</th>
              <th style="padding:8px 4px; font-weight:600; color:var(--text-muted); text-align:right;">%</th>
            </tr>
          </thead>
          <tbody>
            ${sortedExpense.map(([category, amount], index) => {
              const percentage = expenseTotal > 0 ? ((amount / expenseTotal) * 100).toFixed(1) : 0;
              const color = expenseColors[index % expenseColors.length];
              return `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:8px 4px;">
                    <span style="display:inline-block; width:12px; height:12px; background:${color}; border-radius:2px; margin-right:8px; vertical-align:middle;"></span>
                    ${category}
                  </td>
                  <td style="padding:8px 4px; text-align:right; font-weight:600; color:var(--danger);">${fmt(amount)}</td>
                  <td style="padding:8px 4px; text-align:right; color:var(--text-muted);">${percentage}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  }
}

async function renderMonthCompareReport(el) {
  // Initialize comparison state if needed
  if (!state.compareMonth) {
    state.compareMonth = state.selectedMonth;
    state.compareYear = state.selectedYear - 1; // Default to same month last year
  }
  
  const allTxns = await db.transactions.toArray();
  
  // Calculate current period
  const currentTxns = allTxns.filter(t => {
    const [y, m] = t.date.split('-');
    return parseInt(y) === state.selectedYear && parseInt(m) === state.selectedMonth;
  });
  
  const currentIncome = currentTxns.filter(t => t.type === 'INCOME');
  const currentExpenses = currentTxns.filter(t => t.type === 'EXPENSE');
  const currentTotalIncome = currentIncome.reduce((s, t) => s + (t.serviceAmount||0) + (t.tipAmount||0), 0);
  const currentTotalExpense = currentExpenses.reduce((s, t) => s + (t.amount||0), 0);
  const currentNet = currentTotalIncome - currentTotalExpense;
  
  // Get current monthly expenses
  const allMonthlyExpenses = await db.monthlyExpenses.toArray();
  const currentMonthlyExpenses = allMonthlyExpenses.filter(e => 
    e.year === state.selectedYear && e.month === state.selectedMonth
  );
  const currentMonthlyExpenseTotal = currentMonthlyExpenses.reduce((s, e) => s + (e.amount||0), 0);
  const currentNetAfterMonthly = currentNet - currentMonthlyExpenseTotal;
  
  // Calculate comparison period
  const compareTxns = allTxns.filter(t => {
    const [y, m] = t.date.split('-');
    return parseInt(y) === state.compareYear && parseInt(m) === state.compareMonth;
  });
  
  const compareIncome = compareTxns.filter(t => t.type === 'INCOME');
  const compareExpenses = compareTxns.filter(t => t.type === 'EXPENSE');
  const compareTotalIncome = compareIncome.reduce((s, t) => s + (t.serviceAmount||0) + (t.tipAmount||0), 0);
  const compareTotalExpense = compareExpenses.reduce((s, t) => s + (t.amount||0), 0);
  const compareNet = compareTotalIncome - compareTotalExpense;
  
  // Get compare monthly expenses
  const compareMonthlyExpenses = allMonthlyExpenses.filter(e => 
    e.year === state.compareYear && e.month === state.compareMonth
  );
  const compareMonthlyExpenseTotal = compareMonthlyExpenses.reduce((s, e) => s + (e.amount||0), 0);
  const compareNetAfterMonthly = compareNet - compareMonthlyExpenseTotal;
  
  // Calculate changes
  const incomeChange = currentTotalIncome - compareTotalIncome;
  const incomeChangePercent = compareTotalIncome !== 0 ? ((incomeChange / compareTotalIncome) * 100) : 0;
  const expenseChange = (currentTotalExpense + currentMonthlyExpenseTotal) - (compareTotalExpense + compareMonthlyExpenseTotal);
  const expenseChangePercent = (compareTotalExpense + compareMonthlyExpenseTotal) !== 0 ? ((expenseChange / (compareTotalExpense + compareMonthlyExpenseTotal)) * 100) : 0;
  const netChange = currentNetAfterMonthly - compareNetAfterMonthly;
  const netChangePercent = compareNetAfterMonthly !== 0 ? ((netChange / compareNetAfterMonthly) * 100) : 0;
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <h3 style="margin-bottom:16px;">Month-to-Month Comparison</h3>
      
      <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:24px; margin-bottom:24px; align-items:center;">
        <!-- Current Period -->
        <div style="text-align:center;">
          <div style="font-weight:600; font-size:18px; margin-bottom:12px;">Current Period</div>
          <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
            <button class="btn-secondary" onclick="let m=state.selectedMonth-1; let y=state.selectedYear; if(m<1){m=12;y--;} state.selectedMonth=m; state.selectedYear=y; renderReportsView()">←</button>
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
            <button class="btn-secondary" onclick="let m=state.selectedMonth+1; let y=state.selectedYear; if(m>12){m=1;y++;} state.selectedMonth=m; state.selectedYear=y; renderReportsView()">→</button>
          </div>
        </div>
        
        <!-- VS Label -->
        <div style="font-size:24px; font-weight:600; color:var(--text-muted);">VS</div>
        
        <!-- Comparison Period -->
        <div style="text-align:center;">
          <div style="font-weight:600; font-size:18px; margin-bottom:12px;">Comparison Period</div>
          <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
            <button class="btn-secondary" onclick="let m=state.compareMonth-1; let y=state.compareYear; if(m<1){m=12;y--;} state.compareMonth=m; state.compareYear=y; renderReportsView()">←</button>
            <select class="form-select" style="width:auto;" onchange="state.compareMonth=parseInt(this.value); renderReportsView()">
              ${Array.from({length:12}, (_,i) => i+1).map(m => 
                `<option value="${m}" ${m === state.compareMonth ? 'selected' : ''}>${monthName(m)}</option>`
              ).join('')}
            </select>
            <select class="form-select" style="width:auto;" onchange="state.compareYear=parseInt(this.value); renderReportsView()">
              ${[2023,2024,2025,2026,2027].map(y => 
                `<option value="${y}" ${y === state.compareYear ? 'selected' : ''}>${y}</option>`
              ).join('')}
            </select>
            <button class="btn-secondary" onclick="let m=state.compareMonth+1; let y=state.compareYear; if(m>12){m=1;y++;} state.compareMonth=m; state.compareYear=y; renderReportsView()">→</button>
          </div>
        </div>
      </div>
      
      <!-- Quick Preset Buttons -->
      <div style="display:flex; gap:8px; margin-bottom:24px; justify-content:center;">
        <button class="btn-secondary" style="font-size:13px;" onclick="state.compareMonth=state.selectedMonth; state.compareYear=state.selectedYear-1; renderReportsView()">
          Same Month Last Year
        </button>
        <button class="btn-secondary" style="font-size:13px;" onclick="state.compareMonth=(state.selectedMonth > 1 ? state.selectedMonth-1 : 12); state.compareYear=(state.selectedMonth > 1 ? state.selectedYear : state.selectedYear-1); renderReportsView()">
          Previous Month
        </button>
      </div>
      
      <!-- Comparison Table -->
      <table class="data-table" style="margin-bottom:24px;">
        <thead>
          <tr>
            <th>Metric</th>
            <th style="text-align:right;">${monthName(state.selectedMonth)} ${state.selectedYear}</th>
            <th style="text-align:right;">${monthName(state.compareMonth)} ${state.compareYear}</th>
            <th style="text-align:right;">Change</th>
            <th style="text-align:right;">% Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight:600;">Income</td>
            <td style="text-align:right; color:var(--success); font-weight:600;">${fmt(currentTotalIncome)}</td>
            <td style="text-align:right; color:var(--success);">${fmt(compareTotalIncome)}</td>
            <td style="text-align:right; color:${incomeChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${incomeChange >= 0 ? '+' : ''}${fmt(incomeChange)}
            </td>
            <td style="text-align:right; color:${incomeChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${incomeChangePercent >= 0 ? '+' : ''}${incomeChangePercent.toFixed(1)}%
            </td>
          </tr>
          <tr>
            <td style="font-weight:600;">Total Expenses</td>
            <td style="text-align:right; color:var(--danger); font-weight:600;">${fmt(currentTotalExpense + currentMonthlyExpenseTotal)}</td>
            <td style="text-align:right; color:var(--danger);">${fmt(compareTotalExpense + compareMonthlyExpenseTotal)}</td>
            <td style="text-align:right; color:${expenseChange <= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${expenseChange >= 0 ? '+' : ''}${fmt(expenseChange)}
            </td>
            <td style="text-align:right; color:${expenseChange <= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${expenseChangePercent >= 0 ? '+' : ''}${expenseChangePercent.toFixed(1)}%
            </td>
          </tr>
          <tr style="border-top:2px solid var(--border); font-weight:600;">
            <td>Net Profit</td>
            <td style="text-align:right; color:${currentNetAfterMonthly >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${fmt(currentNetAfterMonthly)}
            </td>
            <td style="text-align:right; color:${compareNetAfterMonthly >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${fmt(compareNetAfterMonthly)}
            </td>
            <td style="text-align:right; color:${netChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${netChange >= 0 ? '+' : ''}${fmt(netChange)}
            </td>
            <td style="text-align:right; color:${netChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${netChangePercent >= 0 ? '+' : ''}${netChangePercent.toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>
      
      <!-- Visual Comparison Bars -->
      <div style="margin-top:32px;">
        <h4 style="margin-bottom:16px;">Visual Comparison</h4>
        <canvas id="comparison-chart" style="max-height:400px;"></canvas>
      </div>
    </div>
  `;
  
  // Create comparison bar chart
  const ctx = document.getElementById('comparison-chart');
  if (ctx && window.Chart) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Income', 'Expenses', 'Net Profit'],
        datasets: [
          {
            label: `${monthName(state.selectedMonth)} ${state.selectedYear}`,
            data: [currentTotalIncome, currentTotalExpense + currentMonthlyExpenseTotal, currentNetAfterMonthly],
            backgroundColor: '#2D7A4C'
          },
          {
            label: `${monthName(state.compareMonth)} ${state.compareYear}`,
            data: [compareTotalIncome, compareTotalExpense + compareMonthlyExpenseTotal, compareNetAfterMonthly],
            backgroundColor: '#94A3B8'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: true, position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    });
  }
}

async function renderDateRangeCompareReport(el) {
  // Initialize date range state if needed
  if (!state.range1Start) {
    // Default: Q1 2026 vs Q1 2025
    state.range1Start = `${state.selectedYear}-01-01`;
    state.range1End = `${state.selectedYear}-03-31`;
    state.range2Start = `${state.selectedYear-1}-01-01`;
    state.range2End = `${state.selectedYear-1}-03-31`;
  }
  
  const allTxns = await db.transactions.toArray();
  
  // Helper to calculate range stats
  const calculateRangeStats = (startDate, endDate) => {
    const txns = allTxns.filter(t => t.date >= startDate && t.date <= endDate);
    const income = txns.filter(t => t.type === 'INCOME');
    const expenses = txns.filter(t => t.type === 'EXPENSE');
    const totalIncome = income.reduce((s, t) => s + (t.serviceAmount||0) + (t.tipAmount||0), 0);
    const totalExpense = expenses.reduce((s, t) => s + (t.amount||0), 0);
    
    // Calculate monthly expenses in range
    const [startY, startM] = startDate.split('-');
    const [endY, endM] = endDate.split('-');
    const allMonthlyExpenses = [];
    
    // This is a simplified version - in production you'd iterate through months properly
    return {
      income: totalIncome,
      expense: totalExpense,
      net: totalIncome - totalExpense,
      transactionCount: txns.length,
      incomeCount: income.length,
      expenseCount: expenses.length
    };
  };
  
  const range1 = calculateRangeStats(state.range1Start, state.range1End);
  const range2 = calculateRangeStats(state.range2Start, state.range2End);
  
  // Calculate changes
  const incomeChange = range1.income - range2.income;
  const incomeChangePercent = range2.income !== 0 ? ((incomeChange / range2.income) * 100) : 0;
  const expenseChange = range1.expense - range2.expense;
  const expenseChangePercent = range2.expense !== 0 ? ((expenseChange / range2.expense) * 100) : 0;
  const netChange = range1.net - range2.net;
  const netChangePercent = range2.net !== 0 ? ((netChange / range2.net) * 100) : 0;
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <h3 style="margin-bottom:16px;">Date Range Comparison</h3>
      
      <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:24px; margin-bottom:24px;">
        <!-- Range 1 -->
        <div>
          <div style="font-weight:600; font-size:16px; margin-bottom:12px;">Period 1</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div>
              <label style="font-size:13px; color:var(--text-muted);">Start Date</label>
              <input type="date" class="form-input" value="${state.range1Start}" onchange="state.range1Start=this.value; renderReportsView()">
            </div>
            <div>
              <label style="font-size:13px; color:var(--text-muted);">End Date</label>
              <input type="date" class="form-input" value="${state.range1End}" onchange="state.range1End=this.value; renderReportsView()">
            </div>
          </div>
        </div>
        
        <!-- VS Label -->
        <div style="display:flex; align-items:center; font-size:24px; font-weight:600; color:var(--text-muted);">VS</div>
        
        <!-- Range 2 -->
        <div>
          <div style="font-weight:600; font-size:16px; margin-bottom:12px;">Period 2</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div>
              <label style="font-size:13px; color:var(--text-muted);">Start Date</label>
              <input type="date" class="form-input" value="${state.range2Start}" onchange="state.range2Start=this.value; renderReportsView()">
            </div>
            <div>
              <label style="font-size:13px; color:var(--text-muted);">End Date</label>
              <input type="date" class="form-input" value="${state.range2End}" onchange="state.range2End=this.value; renderReportsView()">
            </div>
          </div>
        </div>
      </div>
      
      <!-- Quick Preset Dropdown -->
      <div style="margin-bottom:24px; display:flex; align-items:center; justify-content:center; gap:12px;">
        <label style="font-weight:600; font-size:14px;">Quick Preset:</label>
        <select class="form-select" style="width:auto; min-width:250px;" onchange="
          const val = this.value;
          const year = ${state.selectedYear};
          if (val === 'q1') {
            state.range1Start = year + '-01-01'; state.range1End = year + '-03-31';
            state.range2Start = (year-1) + '-01-01'; state.range2End = (year-1) + '-03-31';
          } else if (val === 'q2') {
            state.range1Start = year + '-04-01'; state.range1End = year + '-06-30';
            state.range2Start = (year-1) + '-04-01'; state.range2End = (year-1) + '-06-30';
          } else if (val === 'q3') {
            state.range1Start = year + '-07-01'; state.range1End = year + '-09-30';
            state.range2Start = (year-1) + '-07-01'; state.range2End = (year-1) + '-09-30';
          } else if (val === 'q4') {
            state.range1Start = year + '-10-01'; state.range1End = year + '-12-31';
            state.range2Start = (year-1) + '-10-01'; state.range2End = (year-1) + '-12-31';
          } else if (val === 'h1') {
            state.range1Start = year + '-01-01'; state.range1End = year + '-06-30';
            state.range2Start = (year-1) + '-01-01'; state.range2End = (year-1) + '-06-30';
          } else if (val === 'h2') {
            state.range1Start = year + '-07-01'; state.range1End = year + '-12-31';
            state.range2Start = (year-1) + '-07-01'; state.range2End = (year-1) + '-12-31';
          } else if (val === 'fy') {
            state.range1Start = year + '-01-01'; state.range1End = year + '-12-31';
            state.range2Start = (year-1) + '-01-01'; state.range2End = (year-1) + '-12-31';
          }
          if (val !== '') renderReportsView();
          this.value = '';
        ">
          <option value="">-- Select a preset --</option>
          <option value="q1">Q1: Jan-Mar (This Year vs Last Year)</option>
          <option value="q2">Q2: Apr-Jun (This Year vs Last Year)</option>
          <option value="q3">Q3: Jul-Sep (This Year vs Last Year)</option>
          <option value="q4">Q4: Oct-Dec (This Year vs Last Year)</option>
          <option value="h1">H1: Jan-Jun (This Year vs Last Year)</option>
          <option value="h2">H2: Jul-Dec (This Year vs Last Year)</option>
          <option value="fy">Full Year (This Year vs Last Year)</option>
        </select>
      </div>
      
      <!-- Comparison Table -->
      <table class="data-table" style="margin-bottom:24px;">
        <thead>
          <tr>
            <th>Metric</th>
            <th style="text-align:right;">Period 1</th>
            <th style="text-align:right;">Period 2</th>
            <th style="text-align:right;">Change</th>
            <th style="text-align:right;">% Change</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Date Range</td>
            <td style="text-align:right; font-size:13px;">${new Date(state.range1Start).toLocaleDateString()} - ${new Date(state.range1End).toLocaleDateString()}</td>
            <td style="text-align:right; font-size:13px;">${new Date(state.range2Start).toLocaleDateString()} - ${new Date(state.range2End).toLocaleDateString()}</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td style="font-weight:600;">Income</td>
            <td style="text-align:right; color:var(--success); font-weight:600;">${fmt(range1.income)}</td>
            <td style="text-align:right; color:var(--success);">${fmt(range2.income)}</td>
            <td style="text-align:right; color:${incomeChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${incomeChange >= 0 ? '+' : ''}${fmt(incomeChange)}
            </td>
            <td style="text-align:right; color:${incomeChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${incomeChangePercent >= 0 ? '+' : ''}${incomeChangePercent.toFixed(1)}%
            </td>
          </tr>
          <tr>
            <td style="font-weight:600;">Expenses</td>
            <td style="text-align:right; color:var(--danger); font-weight:600;">${fmt(range1.expense)}</td>
            <td style="text-align:right; color:var(--danger);">${fmt(range2.expense)}</td>
            <td style="text-align:right; color:${expenseChange <= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${expenseChange >= 0 ? '+' : ''}${fmt(expenseChange)}
            </td>
            <td style="text-align:right; color:${expenseChange <= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${expenseChangePercent >= 0 ? '+' : ''}${expenseChangePercent.toFixed(1)}%
            </td>
          </tr>
          <tr style="border-top:2px solid var(--border); font-weight:600;">
            <td>Net Profit</td>
            <td style="text-align:right; color:${range1.net >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${fmt(range1.net)}
            </td>
            <td style="text-align:right; color:${range2.net >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${fmt(range2.net)}
            </td>
            <td style="text-align:right; color:${netChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${netChange >= 0 ? '+' : ''}${fmt(netChange)}
            </td>
            <td style="text-align:right; color:${netChange >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
              ${netChangePercent >= 0 ? '+' : ''}${netChangePercent.toFixed(1)}%
            </td>
          </tr>
          <tr style="font-size:13px; color:var(--text-muted);">
            <td>Total Transactions</td>
            <td style="text-align:right;">${range1.transactionCount}</td>
            <td style="text-align:right;">${range2.transactionCount}</td>
            <td style="text-align:right;">${range1.transactionCount - range2.transactionCount >= 0 ? '+' : ''}${range1.transactionCount - range2.transactionCount}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      
      <!-- Visual Comparison -->
      <div style="margin-top:32px;">
        <h4 style="margin-bottom:16px;">Visual Comparison</h4>
        <canvas id="range-comparison-chart" style="max-height:400px;"></canvas>
      </div>
    </div>
  `;
  
  // Create comparison bar chart
  const ctx = document.getElementById('range-comparison-chart');
  if (ctx && window.Chart) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Income', 'Expenses', 'Net Profit'],
        datasets: [
          {
            label: 'Period 1',
            data: [range1.income, range1.expense, range1.net],
            backgroundColor: '#2D7A4C'
          },
          {
            label: 'Period 2',
            data: [range2.income, range2.expense, range2.net],
            backgroundColor: '#94A3B8'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: true, position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
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

async function renderAnnualReport(el) {
  const year = state.selectedYear || new Date().getFullYear();
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <button class="btn-secondary" onclick="state.selectedYear--; renderReportsView()">← Prev Year</button>
        <select class="form-select" style="width:auto;" onchange="state.selectedYear=parseInt(this.value); renderReportsView()">
          ${[2023,2024,2025,2026,2027].map(y => 
            `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`
          ).join('')}
        </select>
        <button class="btn-secondary" onclick="state.selectedYear++; renderReportsView()">Next Year →</button>
      </div>
      <div id="annual-content">Loading...</div>
    </div>
  `;
  
  const allTxns = await db.transactions.toArray();
  const allMExp = await db.monthlyExpenses.toArray();
  
  let yearIncome=0, yearTips=0, yearExp=0;
  const rows = [];
  
  for (let m = 1; m <= 12; m++) {
    const ms = `${year}-${String(m).padStart(2,'0')}`;
    const txns = allTxns.filter(t => t.date?.startsWith(ms));
    const mExps = allMExp.filter(e => e.year === year && e.month === m);
    const inc = txns.filter(t=>t.type==='INCOME').reduce((s,t)=>s+(t.serviceAmount||0),0);
    const tips = txns.filter(t=>t.type==='INCOME').reduce((s,t)=>s+(t.tipAmount||0),0);
    const dExp = txns.filter(t=>t.type==='EXPENSE').reduce((s,t)=>s+(t.amount||0),0);
    const mExp = mExps.reduce((s,e)=>s+(e.amount||0),0);
    yearIncome += inc;
    yearTips += tips;
    yearExp += dExp + mExp;
    rows.push({ m, inc, tips, dExp, mExp, net: inc+tips-dExp-mExp });
  }
  
  const annualContent = document.getElementById('annual-content');
  if (annualContent) {
    annualContent.innerHTML = `
      <div class="summary-grid" style="margin-bottom:24px;">
        <div class="summary-card">
          <div class="summary-label">Services</div>
          <div class="summary-amount positive">${fmt(yearIncome)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Tips</div>
          <div class="summary-amount positive">${fmt(yearTips)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Expenses</div>
          <div class="summary-amount negative">${fmt(yearExp)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Net Profit</div>
          <div class="summary-amount ${yearIncome+yearTips-yearExp >= 0 ? 'positive' : 'negative'}">${fmt(yearIncome+yearTips-yearExp)}</div>
        </div>
      </div>
      
      <div class="card">
        <h4 style="margin-bottom:16px;">Monthly Breakdown</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Income</th>
              <th>Tips</th>
              <th>Expenses</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${monthName(r.m)}</td>
                <td style="color:var(--success)">${fmt(r.inc)}</td>
                <td style="color:var(--success)">${fmt(r.tips)}</td>
                <td style="color:var(--danger)">${fmt(r.dExp+r.mExp)}</td>
                <td style="font-weight:600; color:${r.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(r.net)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

async function renderYOYReport(el) {
  const currentYear = new Date().getFullYear();
  const y1 = state.yoyYear1 || currentYear - 1;
  const y2 = state.yoyYear2 || currentYear;
  
  el.innerHTML = `
    <div style="margin:20px 0;">
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Year 1</label>
          <select class="form-select" id="yoy-year1" onchange="state.yoyYear1=parseInt(this.value); renderReportsView()">
            ${[2023,2024,2025,2026,2027].map(y => 
              `<option value="${y}" ${y === y1 ? 'selected' : ''}>${y}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Year 2</label>
          <select class="form-select" id="yoy-year2" onchange="state.yoyYear2=parseInt(this.value); renderReportsView()">
            ${[2023,2024,2025,2026,2027].map(y => 
              `<option value="${y}" ${y === y2 ? 'selected' : ''}>${y}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div id="yoy-content">Loading...</div>
    </div>
  `;
  
  async function yearTotals(year) {
    const txns = await db.transactions.toArray();
    const yTxns = txns.filter(t => t.date?.startsWith(String(year)));
    const mExps = await db.monthlyExpenses.toArray();
    const yMExp = mExps.filter(e => e.year === year);
    const inc = yTxns.filter(t=>t.type==='INCOME').reduce((s,t)=>s+(t.serviceAmount||0),0);
    const tips = yTxns.filter(t=>t.type==='INCOME').reduce((s,t)=>s+(t.tipAmount||0),0);
    const dExp = yTxns.filter(t=>t.type==='EXPENSE').reduce((s,t)=>s+(t.amount||0),0);
    const mExp = yMExp.reduce((s,e)=>s+(e.amount||0),0);
    return { inc, tips, exp: dExp+mExp, net: inc+tips-dExp-mExp };
  }
  
  const [a, b] = await Promise.all([yearTotals(y1), yearTotals(y2)]);
  
  const diff = (v1, v2) => {
    if (v1 === 0) return '';
    const pct = ((v2-v1)/Math.abs(v1)*100).toFixed(1);
    const arrow = v2 >= v1 ? '▲' : '▼';
    const color = v2 >= v1 ? 'var(--success)' : 'var(--danger)';
    return `<span style="color:${color}; font-size:12px; margin-left:6px">${arrow} ${Math.abs(pct)}%</span>`;
  };
  
  const yoyContent = document.getElementById('yoy-content');
  if (yoyContent) {
    yoyContent.innerHTML = `
      <div class="card">
        <h4 style="margin-bottom:16px;">Year Over Year Comparison</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>${y1}</th>
              <th>${y2}</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Income</td>
              <td style="color:var(--success)">${fmt(a.inc)}</td>
              <td style="color:var(--success)">${fmt(b.inc)}</td>
              <td>${diff(a.inc, b.inc)}</td>
            </tr>
            <tr>
              <td>Tips</td>
              <td style="color:var(--success)">${fmt(a.tips)}</td>
              <td style="color:var(--success)">${fmt(b.tips)}</td>
              <td>${diff(a.tips, b.tips)}</td>
            </tr>
            <tr>
              <td>Expenses</td>
              <td style="color:var(--danger)">${fmt(a.exp)}</td>
              <td style="color:var(--danger)">${fmt(b.exp)}</td>
              <td>${diff(a.exp, b.exp)}</td>
            </tr>
            <tr style="font-weight:600;">
              <td>Net Profit</td>
              <td style="color:${a.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(a.net)}</td>
              <td style="color:${b.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(b.net)}</td>
              <td>${diff(a.net, b.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }
}

async function renderExportReport(el) {
  el.innerHTML = `
    <div style="margin:20px 0;">
      <div style="max-width:600px;">
        <h4 style="margin-bottom:16px;">Export Data to CSV</h4>
        <p style="color:var(--text-muted); margin-bottom:24px;">
          Export your transaction data for use in Excel, Google Sheets, or other spreadsheet applications.
        </p>
        
        <div style="display:flex;gap:12px;margin-bottom:24px;">
          <div class="form-group" style="margin:0; flex:1;">
            <label class="form-label">Start Date</label>
            <input type="date" id="export-start" class="form-input" value="${addDays(todayStr(), -30)}">
          </div>
          <div class="form-group" style="margin:0; flex:1;">
            <label class="form-label">End Date</label>
            <input type="date" id="export-end" class="form-input" value="${todayStr()}">
          </div>
        </div>
        
        <button class="btn-primary" onclick="exportToCSV()">
          📥 Download CSV File
        </button>
      </div>
    </div>
  `;
}

async function exportToCSV() {
  const from = document.getElementById('export-start')?.value;
  const to = document.getElementById('export-end')?.value;
  
  if (!from || !to) {
    showToast('Please select a date range');
    return;
  }
  
  const allTxns = await db.transactions.toArray();
  const txns = allTxns.filter(t => t.date >= from && t.date <= to);
  const mExps = await db.monthlyExpenses.toArray();
  
  let csv = 'Date,Type,Category,Service Amount,Tip Amount,Tip Method,Payment Method,Notes\n';
  
  txns.forEach(t => {
    const row = [
      t.date,
      t.type,
      t.category || '',
      t.type === 'INCOME' ? (t.serviceAmount || 0) : (t.amount || 0),
      t.type === 'INCOME' ? (t.tipAmount || 0) : '',
      t.type === 'INCOME' ? (t.tipMethod || '') : '',
      t.paymentMethod || '',
      (t.notes || '').replace(/,/g, ';')
    ];
    csv += row.join(',') + '\n';
  });
  
  csv += '\n\nMonthly Expenses:\nYear,Month,Category,Amount,Notes\n';
  mExps.filter(e => {
    const d = `${e.year}-${String(e.month).padStart(2,'0')}-01`;
    return d >= from && d <= to;
  }).forEach(e => {
    const row = [
      e.year,
      e.month,
      e.category || '',
      e.amount || 0,
      (e.notes || '').replace(/,/g, ';')
    ];
    csv += row.join(',') + '\n';
  });
  
  // Download CSV
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `salon-data-${from}-to-${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  
  showToast('CSV file downloaded!');
}


// ============================================================
// RENTERS VIEW
// ============================================================

async function renderRentersView() {
  const content = document.getElementById('content');
  
  // Initialize week to current week if not set
  if (!state.rentersWeekStart) {
    state.rentersWeekStart = getWeekStart(todayStr());
  }
  
  const ws = state.rentersWeekStart;
  const weekDue = getWeekDue(ws);
  
  // Get active renters
  const allRenters = await db.renters.toArray();
  const renters = allRenters.filter(r => r.status === 'active' || !r.status);
  
  // Get payments for this week
  const allPayments = await db.rentPayments.toArray();
  const payments = allPayments.filter(p => p.weekStart === ws);
  
  // Create payment map
  const payMap = {};
  payments.forEach(p => { payMap[p.renterId] = p; });
  
  // Calculate totals
  const expectedTotal = renters.reduce((s, r) => s + (r.weeklyRent || 0), 0);
  const collectedTotal = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const outstanding = expectedTotal - collectedTotal;
  
  const isCurrentWeek = ws === getWeekStart(todayStr());
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Booth Renters</h2>
      <p class="page-subtitle">Manage your booth renters and weekly payments</p>
    </div>
    
    <!-- Weekly Navigation -->
    <div style="display:flex; align-items:center; justify-content:center; gap:16px; margin:24px 0;">
      <button class="btn-secondary" onclick="rentersChangeWeek(-1)" style="padding:8px 16px;">
        ← Prev Week
      </button>
      <div style="font-size:18px; font-weight:600; color:var(--text); min-width:280px; text-align:center;">
        Week of ${formatWeekRange(ws)}
      </div>
      <button class="btn-secondary" onclick="rentersChangeWeek(1)" 
        ${isCurrentWeek ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}
        style="padding:8px 16px;">
        Next Week →
      </button>
    </div>
    
    <!-- Summary Card -->
    <div class="card" style="margin-bottom:24px;">
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; padding:8px;">
        <div style="text-align:center;">
          <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px; font-weight:600;">EXPECTED</div>
          <div style="font-size:32px; font-weight:700; color:var(--text);">${fmt(expectedTotal)}</div>
        </div>
        <div style="text-align:center; border-left:1px solid var(--border); border-right:1px solid var(--border);">
          <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px; font-weight:600;">COLLECTED</div>
          <div style="font-size:32px; font-weight:700; color:var(--success);">${fmt(collectedTotal)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:13px; color:var(--text-muted); margin-bottom:4px; font-weight:600;">OUTSTANDING</div>
          <div style="font-size:32px; font-weight:700; color:${outstanding > 0 ? 'var(--danger)' : 'var(--success)'};">
            ${outstanding > 0 ? fmt(outstanding) : '✓ Paid'}
          </div>
        </div>
      </div>
      <div style="text-align:center; padding:12px 0 4px 0; color:var(--text-muted); font-size:14px; border-top:1px solid var(--border); margin-top:12px;">
        Rent due Saturday ${formatDateDisplay(weekDue)}
      </div>
    </div>
    
    <!-- Renters List -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; margin:0;">Renters</h3>
        <button class="btn-primary" onclick="openAddRenterModal()">+ Add Renter</button>
      </div>
      
      ${renters.length === 0 ? `
        <div style="text-align:center; padding:60px 20px; color:var(--text-muted);">
          <div style="font-size:48px; margin-bottom:12px;">👥</div>
          <div style="font-size:16px; font-weight:600; margin-bottom:6px;">No booth renters yet</div>
          <div style="font-size:14px;">Click "+ Add Renter" to get started</div>
        </div>
      ` : `
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:50px;"></th>
              <th>Renter</th>
              <th>Weekly Rent</th>
              <th>Payment Status</th>
              <th style="width:140px;"></th>
            </tr>
          </thead>
          <tbody>
            ${renters.map(r => {
              const p = payMap[r.id];
              const status = p ? getRentStatus(ws, p.datePaid) : 'unpaid';
              const statusLabel = { ontime: 'Paid On Time', late: 'Paid Late', unpaid: 'Not Paid' }[status];
              const statusColor = { ontime: 'var(--success)', late: '#F59E0B', unpaid: 'var(--text-muted)' }[status];
              const icon = { ontime: '✅', late: '⚠️', unpaid: '○' }[status];
              
              return `
                <tr>
                  <td style="text-align:center; font-size:20px;">${icon}</td>
                  <td>
                    <div style="font-weight:600;">${r.name}</div>
                    ${p ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                      Paid ${formatDateDisplay(p.datePaid)} · ${p.paymentMethod}
                    </div>` : ''}
                  </td>
                  <td style="font-weight:600; color:var(--text);">${fmt(r.weeklyRent || 0)}</td>
                  <td>
                    <span style="color:${statusColor}; font-weight:600; font-size:13px;">
                      ${statusLabel}
                    </span>
                  </td>
                  <td style="text-align:right;">
                    ${!p ? `
                      <button class="btn-primary" style="padding:6px 12px; font-size:12px;" 
                        onclick="openLogPaymentModal('${r.id}')">
                        Log Payment
                      </button>
                    ` : `
                      <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" 
                        onclick="openEditPaymentModal('${p.id}')">
                        Edit
                      </button>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
    
    <!-- Manage Renters Section -->
    <div class="card" style="margin-top:24px;">
      <h3 style="font-size:18px; margin-bottom:16px;">Manage Renters</h3>
      <p style="color:var(--text-muted); margin-bottom:16px; font-size:14px;">
        Add, edit, or remove booth renters. Active renters will appear in the weekly payment tracking above.
      </p>
      <button class="btn-secondary" onclick="openManageRentersModal()">View All Renters</button>
    </div>
  `;
}

function rentersChangeWeek(dir) {
  state.rentersWeekStart = dir === 1
    ? nextWeekStart(state.rentersWeekStart)
    : prevWeekStart(state.rentersWeekStart);
  renderRentersView();
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
    status: 'active', // New renters are active by default
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
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="edit-renter-status" class="form-select">
          <option value="active" ${r.status === 'active' || !r.status ? 'selected' : ''}>Active</option>
          <option value="inactive" ${r.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
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
    notes: document.getElementById('edit-renter-notes').value,
    status: document.getElementById('edit-renter-status').value
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
// RENT PAYMENT FUNCTIONS
// ============================================================

async function openLogPaymentModal(renterId) {
  const renter = await db.renters.get(renterId);
  if (!renter) return;
  
  openModal(`
    <h2 class="modal-title">Log Rent Payment</h2>
    <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px;">
      ${renter.name} · Week of ${formatWeekRange(state.rentersWeekStart)}
    </p>
    
    <form onsubmit="saveRentPayment('${renterId}'); return false;">
      <div class="form-group">
        <label class="form-label">Amount Paid ($)</label>
        <input type="number" id="rp-amount" class="form-input" step="0.01" min="0" 
          value="${renter.weeklyRent || 140}" required>
      </div>
      
      <div class="form-group">
        <label class="form-label">Date Paid</label>
        <input type="date" id="rp-date" class="form-input" value="${todayStr()}" required>
      </div>
      
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select id="rp-method" class="form-select" required>
          <option>Cash</option>
          <option>Venmo</option>
          <option>Zelle</option>
          <option>Card</option>
          <option>Check</option>
          <option>Other</option>
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <input type="text" id="rp-notes" class="form-input" placeholder="Any notes...">
      </div>
      
      <div style="display:flex; gap:8px; margin-top:24px;">
        <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" style="flex:1;">Save Payment</button>
      </div>
    </form>
  `);
}

async function saveRentPayment(renterId) {
  const amount = parseFloat(document.getElementById('rp-amount').value);
  const datePaid = document.getElementById('rp-date').value;
  const method = document.getElementById('rp-method').value;
  const notes = document.getElementById('rp-notes').value.trim();
  
  if (!amount || !datePaid) {
    showToast('Please fill in amount and date');
    return;
  }
  
  const ws = state.rentersWeekStart;
  
  // Check if payment already exists for this renter + week
  const allPayments = await db.rentPayments.toArray();
  const existing = allPayments.find(p => p.renterId === renterId && p.weekStart === ws);
  
  if (existing) {
    showToast('Payment already logged for this week');
    return;
  }
  
  const payment = {
    userId: currentUser.uid,
    renterId: renterId,
    weekStart: ws,
    amount: amount,
    datePaid: datePaid,
    paymentMethod: method,
    notes: notes,
    createdAt: firebase.firestore.Timestamp.now()
  };
  
  // Save to Firestore
  const docRef = await firestore.collection('users')
    .doc(currentUser.uid)
    .collection('rentPayments')
    .add(payment);
  
  // Save to local DB
  payment.id = docRef.id;
  await db.rentPayments.add(payment);
  
  showToast('Payment logged successfully');
  closeModal();
  renderRentersView();
}

async function openEditPaymentModal(paymentId) {
  const payment = await db.rentPayments.get(paymentId);
  if (!payment) return;
  
  const renter = await db.renters.get(payment.renterId);
  
  openModal(`
    <h2 class="modal-title">Edit Rent Payment</h2>
    <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px;">
      ${renter ? renter.name : 'Renter'} · Week of ${formatWeekRange(payment.weekStart)}
    </p>
    
    <form onsubmit="saveEditPayment('${paymentId}'); return false;">
      <div class="form-group">
        <label class="form-label">Amount Paid ($)</label>
        <input type="number" id="ep-amount" class="form-input" step="0.01" min="0" 
          value="${payment.amount}" required>
      </div>
      
      <div class="form-group">
        <label class="form-label">Date Paid</label>
        <input type="date" id="ep-date" class="form-input" value="${payment.datePaid}" required>
      </div>
      
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select id="ep-method" class="form-select" required>
          ${['Cash', 'Venmo', 'Zelle', 'Card', 'Check', 'Other'].map(m => 
            `<option ${m === payment.paymentMethod ? 'selected' : ''}>${m}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <input type="text" id="ep-notes" class="form-input" value="${payment.notes || ''}" 
          placeholder="Any notes...">
      </div>
      
      <div style="display:flex; gap:8px; margin-top:24px;">
        <button type="button" class="btn-danger" style="flex:1;" onclick="deletePayment('${paymentId}')">
          Delete Payment
        </button>
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary" style="flex:1;">Save Changes</button>
      </div>
    </form>
  `);
}

async function saveEditPayment(paymentId) {
  const amount = parseFloat(document.getElementById('ep-amount').value);
  const datePaid = document.getElementById('ep-date').value;
  const method = document.getElementById('ep-method').value;
  const notes = document.getElementById('ep-notes').value.trim();
  
  if (!amount || !datePaid) {
    showToast('Please fill in amount and date');
    return;
  }
  
  const updates = {
    amount: amount,
    datePaid: datePaid,
    paymentMethod: method,
    notes: notes
  };
  
  // Update Firestore
  await firestore.collection('users')
    .doc(currentUser.uid)
    .collection('rentPayments')
    .doc(paymentId)
    .update(updates);
  
  // Update local DB
  await db.rentPayments.update(paymentId, updates);
  
  showToast('Payment updated');
  closeModal();
  renderRentersView();
}

async function deletePayment(paymentId) {
  const confirmed = await confirmDialog(
    'Are you sure you want to delete this payment? This cannot be undone.',
    'Confirm Delete'
  );
  
  if (!confirmed) return;
  
  // Delete from Firestore
  await firestore.collection('users')
    .doc(currentUser.uid)
    .collection('rentPayments')
    .doc(paymentId)
    .delete();
  
  // Delete from local DB
  await db.rentPayments.delete(paymentId);
  
  showToast('Payment deleted');
  closeModal();
  renderRentersView();
}

// ============================================================
// MANAGE RENTERS MODAL
// ============================================================

async function openManageRentersModal() {
  const renters = await db.renters.toArray();
  
  openModal(`
    <h2 class="modal-title">Manage Renters</h2>
    <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px;">
      Add, edit, or remove booth renters
    </p>
    
    <div style="margin-bottom:16px;">
      <button class="btn-primary" onclick="closeModal(); setTimeout(() => openAddRenterModal(), 100);" style="width:100%;">
        + Add New Renter
      </button>
    </div>
    
    ${renters.length === 0 ? `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        No renters yet. Click "Add New Renter" to get started.
      </div>
    ` : `
      <div style="max-height:400px; overflow-y:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Weekly Rent</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${renters.map(r => `
              <tr>
                <td style="font-weight:600;">${r.name}</td>
                <td>${fmt(r.weeklyRent || 0)}</td>
                <td>
                  <span style="color:${r.status === 'active' || !r.status ? 'var(--success)' : 'var(--text-muted)'};">
                    ${r.status === 'active' || !r.status ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style="text-align:right;">
                  <button class="btn-secondary" style="padding:4px 8px; font-size:12px; margin-right:4px;" 
                    onclick="closeModal(); setTimeout(() => openEditRenterModal('${r.id}'), 100);">
                    Edit
                  </button>
                  <button class="btn-danger" style="padding:4px 8px; font-size:12px;" 
                    onclick="closeModal(); setTimeout(() => deleteRenter('${r.id}'), 100);">
                    Delete
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
    
    <div style="margin-top:20px;">
      <button class="btn-secondary" onclick="closeModal()" style="width:100%;">Close</button>
    </div>
  `, 'large');
}


// ============================================================
// SETTINGS VIEW
// ============================================================

async function renderSettingsView() {
  const content = document.getElementById('content');
  
  // FORCE reload categories from Firebase before rendering
  console.log('=== SETTINGS: Force reloading categories from Firebase ===');
  await loadCategories();
  console.log('Current state.categories:', JSON.parse(JSON.stringify(state.categories)));
  
  content.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Settings</h2>
      <p class="page-subtitle">Manage categories and preferences</p>
    </div>
    
    <div class="card">
      <div style="background:#FFE6E6; border-left:4px solid #C13838; padding:16px; margin-bottom:16px; border-radius:4px;">
        <div style="font-weight:600; margin-bottom:8px; font-size:15px;">🐛 Category Sync Debug Tools</div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">
          Desktop showing: <strong>${(state.categories.EXPENSE || []).length} expense categories</strong><br>
          Mobile should have: <strong>18 expense categories</strong>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-secondary" onclick="fullCategoryDiagnosis()" style="padding:8px 16px; font-size:13px; font-weight:600;">
            📊 Run Full Diagnosis
          </button>
          <button class="btn-primary" onclick="forceFixCategories()" style="padding:8px 16px; font-size:13px; font-weight:600; background:#C13838;">
            🔧 FORCE FIX - Sync from Mobile
          </button>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
          Click "Run Full Diagnosis" and check browser console (F12) for detailed info
        </div>
      </div>
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
      <h3 style="font-size:18px; margin-bottom:16px;">Expense Categories (${(state.categories.EXPENSE || []).length} total)</h3>
      <div id="all-expense-categories" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
        ${(state.categories.EXPENSE || []).map((cat, idx) => `
          <div class="category-tag">
            ${cat}
            <button onclick="removeCategory('EXPENSE', ${idx})" class="category-remove">×</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="new-expense-cat" class="form-input" placeholder="New category name">
        <button class="btn-primary" onclick="addCategory('EXPENSE')">Add</button>
      </div>
      <p style="color:var(--text-muted); font-size:13px; margin-top:12px;">
        All expense categories (used for both daily and monthly expenses)
      </p>
    </div>
    
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:18px; margin-bottom:16px;">Restore from Backup</h3>
      <p style="color:var(--text-muted); margin-bottom:16px;">
        Restore data from a CSV backup file that you previously exported. This will add the backup data to your database.
      </p>
      
      <div style="border: 2px dashed var(--border); border-radius:8px; padding:24px; text-align:center; background:var(--bg-secondary); margin-bottom:12px;">
        <input type="file" id="backup-file-input" accept=".csv" style="display:none;" onchange="handleBackupUpload(event)">
        <div style="cursor:pointer;" onclick="document.getElementById('backup-file-input').click()">
          <div style="font-size:40px; margin-bottom:8px;">💾</div>
          <div style="font-size:15px; font-weight:600; margin-bottom:6px;">
            Restore from Backup CSV
          </div>
          <div style="font-size:13px; color:var(--text-muted);">
            Upload a CSV file exported from Reports → Export
          </div>
        </div>
      </div>
      
      <div id="restore-status" style="display:none;">
        <div style="background:var(--bg-secondary); border-radius:8px; padding:16px; margin-bottom:12px;">
          <div id="restore-preview"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" onclick="executeRestore()" style="flex:1;">
            Restore Data
          </button>
          <button class="btn-secondary" onclick="cancelRestore()" style="flex:1;">
            Cancel
          </button>
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:18px; margin-bottom:16px;">Import Historical Data</h3>
      <p style="color:var(--text-muted); margin-bottom:16px;">
        Import transactions from your historical data CSV file (Vagaro/Square format). This will add past transactions to your database.
      </p>
      <div id="import-stats" style="display:none; background:var(--bg-secondary); border-radius:8px; padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; margin-bottom:4px;">Imported Data Found</div>
            <div style="font-size:14px; color:var(--text-muted);" id="import-stats-text"></div>
          </div>
          <button class="btn-danger" onclick="deleteImportedData()" style="white-space:nowrap;">
            Delete Imported Data
          </button>
        </div>
      </div>
      
      <div style="border: 2px dashed var(--border); border-radius:8px; padding:32px; text-align:center; background:var(--bg-secondary); margin-bottom:16px;">
        <input type="file" id="csv-file-input" accept=".csv" style="display:none;" onchange="handleCSVUpload(event)">
        <div id="drop-zone" style="cursor:pointer;" onclick="document.getElementById('csv-file-input').click()">
          <div style="font-size:48px; margin-bottom:12px;">📄</div>
          <div style="font-size:16px; font-weight:600; margin-bottom:8px;">
            Click to select CSV file or drag & drop
          </div>
          <div style="font-size:14px; color:var(--text-muted);">
            Accepts: .csv files
          </div>
        </div>
      </div>
      
      <div id="import-status" style="display:none;">
        <div style="margin-bottom:12px;">
          <strong id="import-filename"></strong>
        </div>
        <div id="import-preview" style="margin-bottom:16px;"></div>
        <div id="import-progress" style="display:none;">
          <div style="background:var(--border); border-radius:4px; height:24px; overflow:hidden; margin-bottom:8px;">
            <div id="progress-bar" style="background:var(--primary); height:100%; width:0%; transition:width 0.3s;"></div>
          </div>
          <div id="progress-text" style="text-align:center; font-size:14px; color:var(--text-muted);"></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button id="import-btn" class="btn-primary" onclick="startImport()" style="flex:1;">
            Import All
          </button>
          <button class="btn-secondary" onclick="cancelImport()" style="flex:1;">
            Cancel
          </button>
        </div>
      </div>
      
      <div id="import-complete" style="display:none; text-align:center; padding:32px;">
        <div style="font-size:48px; margin-bottom:16px;">✅</div>
        <div style="font-size:18px; font-weight:600; margin-bottom:8px;">Import Complete!</div>
        <div id="import-summary" style="color:var(--text-muted); margin-bottom:16px;"></div>
        <button class="btn-primary" onclick="navigate('reports'); state.reportType='weekly'; renderReportsView()">
          View Reports →
        </button>
      </div>
    </div>
    
    <div class="card" style="margin-top:16px; border:2px solid var(--danger);">
      <h3 style="font-size:18px; margin-bottom:8px; color:var(--danger);">⚠️ Danger Zone</h3>
      <p style="color:var(--text-muted); margin-bottom:16px; font-size:14px;">
        Irreversible actions. These operations cannot be undone.
      </p>
      
      <div style="background:#fff3cd; border:1px solid #ffc107; padding:16px; border-radius:8px; margin-bottom:16px;">
        <div style="font-weight:600; margin-bottom:8px; color:#856404;">Delete All Data</div>
        <p style="font-size:14px; color:#856404; margin-bottom:12px;">
          This will permanently delete ALL data from your salon app including:
        </p>
        <ul style="font-size:13px; color:#856404; margin-bottom:12px; padding-left:20px;">
          <li>All transactions (income and expenses)</li>
          <li>All monthly expenses</li>
          <li>All booth renters</li>
          <li>All custom categories</li>
          <li>Everything from Firebase and local storage</li>
        </ul>
        <p style="font-size:13px; color:#856404; font-weight:600;">
          ⚠️ This action is PERMANENT and cannot be undone. Your account will be reset to empty.
        </p>
        <button class="btn-danger" onclick="initiateDeleteAllData()" style="margin-top:12px; width:100%;">
          Delete All Data (Cannot Be Undone)
        </button>
      </div>
    </div>
    
    <div class="card" style="margin-top:16px;">
      <h3 style="font-size:18px; margin-bottom:16px;">About</h3>
      <p style="margin-bottom:12px;">Mane Frame Salon - Desktop Edition</p>
      <p style="margin-bottom:12px;">Data syncs automatically with mobile app</p>
      <p style="color:var(--text-muted); font-size:14px;">Signed in as: ${currentUser?.email}</p>
    </div>
  `;
  
  // Check for existing imported data
  checkImportedData();
}

async function addCategory(type) {
  let inputId;
  if (type === 'INCOME') inputId = 'new-income-cat';
  else if (type === 'EXPENSE') inputId = 'new-expense-cat';
  
  const input = document.getElementById(inputId);
  const newCat = input?.value.trim();
  
  if (!newCat) {
    showToast('Please enter a category name');
    return;
  }
  
  if (state.categories[type]?.includes(newCat)) {
    showToast('Category already exists');
    return;
  }
  
  if (!state.categories[type]) {
    state.categories[type] = [];
  }
  
  state.categories[type].push(newCat);
  await saveCategories();
  input.value = '';
  renderSettingsView();
}

async function removeCategory(type, index) {
  if (!confirm('Remove this category?')) return;
  
  state.categories[type].splice(index, 1);
  await saveCategories();
  renderSettingsView();
}

async function debugCategories() {
  console.log('=== CATEGORY DEBUG INFO ===');
  console.log('Current state.categories:', JSON.parse(JSON.stringify(state.categories)));
  
  try {
    const doc = await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').get();
    if (doc.exists) {
      const fbData = doc.data();
      console.log('Firebase raw data:', fbData);
      console.log('Has EXPENSE?', !!fbData.EXPENSE);
      console.log('Has DAILY_EXPENSE?', !!fbData.DAILY_EXPENSE);
      console.log('Has MONTHLY_EXPENSE?', !!fbData.MONTHLY_EXPENSE);
      
      if (fbData.EXPENSE) {
        console.log('EXPENSE array:', fbData.EXPENSE);
      }
      if (fbData.DAILY_EXPENSE) {
        console.log('DAILY_EXPENSE array:', fbData.DAILY_EXPENSE);
      }
      if (fbData.MONTHLY_EXPENSE) {
        console.log('MONTHLY_EXPENSE array:', fbData.MONTHLY_EXPENSE);
      }
      
      alert(`Debug info logged to console (F12).\n\nState EXPENSE: ${state.categories.EXPENSE?.length || 0} categories\nFirebase has: ${fbData.EXPENSE ? 'new format' : 'old format'}`);
    } else {
      alert('No categories document found in Firebase!');
    }
  } catch (err) {
    console.error('Debug error:', err);
    alert('Error reading Firebase: ' + err.message);
  }
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

// ============================================================
// RESTORE FROM BACKUP
// ============================================================

let restoreData = null;

function handleBackupUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    parseBackupCSV(text);
  };
  reader.readAsText(file);
}

function parseBackupCSV(text) {
  const lines = text.split('\n');
  
  const transactions = [];
  const monthlyExpenses = [];
  
  let currentSection = 'transactions';
  let txnHeaders = [];
  let expHeaders = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) continue;
    
    // Check for section headers
    if (line === 'Monthly Expenses:' || line.startsWith('Monthly Expenses')) {
      currentSection = 'monthly';
      continue;
    }
    
    // Split by comma, but be careful with empty fields
    const values = line.split(',');
    
    if (currentSection === 'transactions') {
      if (line.startsWith('Date,Type,Category') || line.startsWith('Date,')) {
        txnHeaders = values;
        continue;
      }
      
      if (txnHeaders.length > 0 && values.length >= 4) {
        // Parse transaction
        const txn = {
          date: (values[0] || '').trim(),
          type: (values[1] || '').trim(),
          category: (values[2] || '').trim(),
          serviceAmount: parseFloat(values[3]) || 0,
          tipAmount: parseFloat(values[4]) || 0,
          tipMethod: (values[5] || '').trim(),
          paymentMethod: (values[6] || '').trim(),
          notes: (values[7] || '').trim()
        };
        
        // Only add if has required fields
        if (txn.date && txn.type) {
          transactions.push(txn);
        }
      }
    } else if (currentSection === 'monthly') {
      if (line.startsWith('Year,Month,Category') || line.startsWith('Year,')) {
        expHeaders = values;
        continue;
      }
      
      if (expHeaders.length > 0 && values.length >= 4) {
        // Parse monthly expense
        const exp = {
          year: parseInt(values[0]) || 0,
          month: parseInt(values[1]) || 0,
          category: (values[2] || '').trim(),
          amount: parseFloat(values[3]) || 0,
          notes: (values[4] || '').trim()
        };
        
        // Only add if has required fields
        if (exp.year > 0 && exp.month > 0) {
          monthlyExpenses.push(exp);
        }
      }
    }
  }
  
  restoreData = { transactions, monthlyExpenses };
  showRestorePreview();
}

function showRestorePreview() {
  if (!restoreData) return;
  
  const { transactions, monthlyExpenses } = restoreData;
  
  const previewHTML = `
    <div style="font-weight:600; margin-bottom:12px;">Ready to Restore:</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:14px;">
      <div>
        <div style="color:var(--text-muted);">Transactions:</div>
        <div style="font-size:18px; font-weight:600;">${transactions.length}</div>
      </div>
      <div>
        <div style="color:var(--text-muted);">Monthly Expenses:</div>
        <div style="font-size:18px; font-weight:600;">${monthlyExpenses.length}</div>
      </div>
    </div>
    <div style="margin-top:12px; padding:12px; background:#fff3cd; border:1px solid #ffc107; border-radius:4px; font-size:13px; color:#856404;">
      ⚠️ This will add the backup data to your existing database. Existing data will not be affected.
    </div>
  `;
  
  document.getElementById('restore-preview').innerHTML = previewHTML;
  document.getElementById('restore-status').style.display = 'block';
}

async function executeRestore() {
  if (!restoreData) {
    showToast('No backup data to restore');
    return;
  }
  
  const { transactions, monthlyExpenses } = restoreData;
  let restored = 0;
  let errors = 0;
  
  try {
    showToast('Restoring backup...');
    
    // Restore transactions
    for (const txn of transactions) {
      try {
        // Build data object based on transaction type
        const data = {
          userId: currentUser.uid,
          date: txn.date,
          type: txn.type,
          category: txn.category || '',
          notes: txn.notes || '',
          createdAt: firebase.firestore.Timestamp.now()
        };
        
        // Add fields based on type
        if (txn.type === 'INCOME') {
          data.serviceAmount = txn.serviceAmount || 0;
          data.tipAmount = txn.tipAmount || 0;
          data.tipMethod = txn.tipMethod || '';
          data.paymentMethod = txn.paymentMethod || '';
        } else if (txn.type === 'EXPENSE' || txn.type === 'DAILY_EXPENSE') {
          data.amount = txn.serviceAmount || 0;
          data.paymentMethod = txn.paymentMethod || '';
        }
        
        const docRef = await firestore.collection('users').doc(currentUser.uid).collection('transactions').add(data);
        await db.transactions.put({ id: docRef.id, ...data });
        restored++;
      } catch (err) {
        console.error('Error restoring transaction:', txn, err);
        errors++;
      }
    }
    
    // Restore monthly expenses
    for (const exp of monthlyExpenses) {
      try {
        const data = {
          userId: currentUser.uid,
          year: exp.year,
          month: exp.month,
          category: exp.category || '',
          amount: exp.amount || 0,
          notes: exp.notes || '',
          createdAt: firebase.firestore.Timestamp.now()
        };
        
        const docRef = await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').add(data);
        await db.monthlyExpenses.put({ id: docRef.id, ...data });
        restored++;
      } catch (err) {
        console.error('Error restoring monthly expense:', exp, err);
        errors++;
      }
    }
    
    showToast(`Restored ${restored} items from backup!${errors > 0 ? ` (${errors} errors)` : ''}`);
    
    // Reset
    restoreData = null;
    document.getElementById('restore-status').style.display = 'none';
    document.getElementById('backup-file-input').value = '';
    
    // Refresh current view
    if (state.currentView === 'daily') renderDailyView();
    else if (state.currentView === 'monthly') renderMonthlyView();
    else navigate('daily');
    
  } catch (err) {
    console.error('Error restoring backup:', err);
    showToast(`Error restoring backup: ${err.message}`);
  }
}

function cancelRestore() {
  restoreData = null;
  document.getElementById('restore-status').style.display = 'none';
  document.getElementById('backup-file-input').value = '';
  showToast('Restore cancelled');
}

// ============================================================
// CSV IMPORT FUNCTIONALITY
// ============================================================

let importData = null;

async function checkImportedData() {
  // Check if there are any imported transactions
  const allTxns = await db.transactions.toArray();
  const imported = allTxns.filter(t => t.imported === true);
  
  if (imported.length > 0) {
    const statsEl = document.getElementById('import-stats');
    const textEl = document.getElementById('import-stats-text');
    
    if (statsEl && textEl) {
      const totalAmount = imported.reduce((sum, t) => sum + (t.serviceAmount || 0), 0);
      const dates = imported.map(t => t.date).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];
      
      textEl.textContent = `${imported.length} transactions imported (${minDate} to ${maxDate}) - Total: ${fmt(totalAmount)}`;
      statsEl.style.display = 'block';
    }
  }
}

async function deleteImportedData() {
  const confirmed = await confirmDialog(
    'Are you sure you want to delete ALL imported historical data?\n\nThis will remove all transactions that were imported via CSV.\n\nThis cannot be undone.',
    'Delete Imported Data'
  );
  
  if (!confirmed) return;
  
  showToast('Deleting imported data...');
  
  try {
    // Get all imported transactions
    const allTxns = await db.transactions.toArray();
    const imported = allTxns.filter(t => t.imported === true);
    
    let deleted = 0;
    
    // Delete from Firebase and IndexedDB
    for (const txn of imported) {
      try {
        await firestore.collection('users').doc(currentUser.uid).collection('transactions').doc(txn.id).delete();
        await db.transactions.delete(txn.id);
        deleted++;
      } catch (err) {
        console.error('Error deleting transaction:', txn.id, err);
      }
    }
    
    showToast(`Deleted ${deleted} imported transactions`);
    
    // Refresh settings view
    renderSettingsView();
    
  } catch (err) {
    console.error('Error deleting imported data:', err);
    showToast('Error deleting imported data');
  }
}

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  document.getElementById('import-filename').textContent = file.name;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    parseCSV(text);
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split('\n');
  
  // Proper CSV parser that handles quoted fields
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    return result;
  }
  
  const headers = parseCSVLine(lines[0]);
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    // Only add if has required fields
    if (row.date && row.service) {
      data.push(row);
    }
  }
  
  importData = data;
  showImportPreview(data);
}

function showImportPreview(data) {
  const cardCount = data.filter(d => d.payment_method === 'Card').length;
  const checkCount = data.filter(d => d.payment_method === 'Check/Cash').length;
  
  const totalIncome = data.reduce((sum, d) => {
    // Handle empty strings and invalid values
    let amount = 0;
    if (d.square_amount && d.square_amount !== '') {
      amount = parseFloat(d.square_amount);
    } else if (d.estimated_price && d.estimated_price !== '') {
      amount = parseFloat(d.estimated_price);
    }
    // Skip if NaN
    if (isNaN(amount)) amount = 0;
    return sum + amount;
  }, 0);
  
  const totalTips = data.reduce((sum, d) => {
    let tip = 0;
    if (d.square_tip && d.square_tip !== '') {
      tip = parseFloat(d.square_tip);
    }
    // Skip if NaN
    if (isNaN(tip)) tip = 0;
    return sum + tip;
  }, 0);
  
  const previewHTML = `
    <div style="background:var(--bg-secondary); border-radius:8px; padding:16px; margin-bottom:16px;">
      <div style="font-weight:600; margin-bottom:12px;">Ready to Import:</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:14px;">
        <div>
          <div style="color:var(--text-muted);">Total Transactions:</div>
          <div style="font-size:20px; font-weight:600;">${data.length}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);">Total Income:</div>
          <div style="font-size:20px; font-weight:600; color:var(--success);">${fmt(totalIncome)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);">Card Payments:</div>
          <div style="font-weight:600;">${cardCount} (${(cardCount/data.length*100).toFixed(1)}%)</div>
        </div>
        <div>
          <div style="color:var(--text-muted);">Check/Cash:</div>
          <div style="font-weight:600;">${checkCount} (${(checkCount/data.length*100).toFixed(1)}%)</div>
        </div>
        <div>
          <div style="color:var(--text-muted);">Total Tips:</div>
          <div style="font-weight:600; color:var(--success);">${fmt(totalTips)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);">Date Range:</div>
          <div style="font-weight:600;">${data[0].date} to ${data[data.length-1].date}</div>
        </div>
      </div>
    </div>
    
    <div style="background:#fff3cd; border:1px solid #ffc107; color:#856404; padding:12px; border-radius:8px; font-size:14px; margin-bottom:16px;">
      ⚠️ <strong>Note:</strong> Imported data can be deleted later via Settings if needed.
      All imported transactions will be marked and can be reversed.
    </div>
  `;
  
  document.getElementById('import-preview').innerHTML = previewHTML;
  document.getElementById('import-status').style.display = 'block';
}

async function startImport() {
  if (!importData || importData.length === 0) {
    showToast('No data to import');
    return;
  }
  
  // Initialize log
  const log = [];
  const logTimestamp = new Date().toISOString();
  log.push('='.repeat(80));
  log.push('IMPORT LOG');
  log.push('='.repeat(80));
  log.push(`Started: ${logTimestamp}`);
  log.push(`File: Historical data import (Vagaro/Square CSV)`);
  log.push(`Total rows to import: ${importData.length}`);
  log.push('='.repeat(80));
  log.push('');
  
  // Disable import button
  document.getElementById('import-btn').disabled = true;
  document.getElementById('import-progress').style.display = 'block';
  
  let imported = 0;
  let errors = 0;
  let skipped = 0;
  const errorDetails = [];
  const total = importData.length;
  
  // Get current timestamp for this import batch
  const importTimestamp = firebase.firestore.Timestamp.now();
  
  // Map service names to categories
  const serviceToCategory = (service) => {
    const s = service.toLowerCase();
    if (s.includes('highlight') || s.includes('color') || s.includes('root') || s.includes('glaze')) {
      return 'Color';
    } else if (s.includes('haircut') || s.includes('cut') || s.includes('trim') || s.includes('bang') || s.includes('shampoo') || s.includes('blowdry')) {
      return 'Haircut';
    } else if (s.includes('perm')) {
      return 'Perm';
    } else {
      return 'Other';
    }
  };
  
  log.push('IMPORT PROGRESS:');
  log.push('-'.repeat(80));
  
  for (let i = 0; i < importData.length; i++) {
    const row = importData[i];
    const rowNum = i + 1;
    
    try {
      // Determine type and amount
      let type = 'INCOME';
      let amount = 0;
      let tipAmount = 0;
      
      if (row.payment_method === 'Card' && row.square_amount) {
        amount = parseFloat(row.square_amount);
        tipAmount = parseFloat(row.square_tip || 0);
      } else {
        amount = parseFloat(row.estimated_price || 0);
      }
      
      if (amount === 0) {
        skipped++;
        const skipMsg = `Row ${rowNum}: SKIPPED - Zero amount (Date: ${row.date}, Service: ${row.service})`;
        log.push(skipMsg);
        errorDetails.push(skipMsg);
        continue;
      }
      
      const category = serviceToCategory(row.service);
      
      // Create transaction - MARKED AS IMPORTED!
      const txn = {
        userId: currentUser.uid,
        date: row.date,
        type: type,
        category: category,
        serviceAmount: amount,
        tipAmount: tipAmount,
        paymentMethod: row.payment_method === 'Card' ? 'Card' : 'Check',
        notes: `${row.service} - Imported from historical data`,
        imported: true,  // ← MARKED AS IMPORTED!
        importedAt: importTimestamp,  // ← TIMESTAMP THIS IMPORT BATCH
        createdAt: firebase.firestore.Timestamp.now()
      };
      
      // Add to Firebase
      const docRef = await firestore.collection('users').doc(currentUser.uid).collection('transactions').add(txn);
      
      // Add to IndexedDB
      await db.transactions.put({ id: docRef.id, ...txn });
      
      imported++;
      
      // Log every 100 transactions
      if (imported % 100 === 0) {
        log.push(`✓ Imported ${imported} of ${total} transactions...`);
      }
      
      // Update progress
      const progress = (i + 1) / total * 100;
      document.getElementById('progress-bar').style.width = progress + '%';
      document.getElementById('progress-text').textContent = `Importing ${i + 1} of ${total}...`;
      
      // Small delay to prevent overwhelming Firebase
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
    } catch (err) {
      errors++;
      const errorMsg = `Row ${rowNum}: ERROR - ${err.message} (Date: ${row.date}, Service: ${row.service}, Amount: ${row.square_amount || row.estimated_price})`;
      log.push(errorMsg);
      errorDetails.push(errorMsg);
      console.error('Error importing row:', row, err);
    }
  }
  
  // Final log summary
  log.push('');
  log.push('='.repeat(80));
  log.push('IMPORT SUMMARY');
  log.push('='.repeat(80));
  log.push(`Completed: ${new Date().toISOString()}`);
  log.push(`Total rows processed: ${total}`);
  log.push(`Successfully imported: ${imported}`);
  log.push(`Skipped (zero amount): ${skipped}`);
  log.push(`Errors: ${errors}`);
  log.push(`Success rate: ${((imported/total)*100).toFixed(1)}%`);
  log.push('='.repeat(80));
  
  if (errorDetails.length > 0) {
    log.push('');
    log.push('ERROR DETAILS:');
    log.push('-'.repeat(80));
    errorDetails.forEach(err => log.push(err));
  }
  
  log.push('');
  log.push('='.repeat(80));
  log.push('END OF LOG');
  log.push('='.repeat(80));
  
  // Create downloadable log file
  const logText = log.join('\n');
  const logBlob = new Blob([logText], { type: 'text/plain' });
  const logUrl = URL.createObjectURL(logBlob);
  const logFilename = `import-log-${new Date().toISOString().split('T')[0]}.txt`;
  
  // Show completion with log download option
  document.getElementById('import-status').style.display = 'none';
  document.getElementById('import-complete').style.display = 'block';
  document.getElementById('import-summary').innerHTML = `
    Successfully imported <strong>${imported}</strong> transactions<br>
    ${skipped > 0 ? `<span style="color:var(--warning);">Skipped ${skipped} (zero amount)</span><br>` : ''}
    ${errors > 0 ? `<span style="color:var(--danger);">Errors: ${errors}</span><br>` : ''}
    <span style="font-size:13px; color:var(--text-muted); margin-top:8px; display:block;">
      These transactions are marked as imported and can be deleted from Settings if needed.
    </span>
    <div style="margin-top:16px;">
      <a href="${logUrl}" download="${logFilename}" class="btn-secondary" style="display:inline-block; padding:8px 16px; text-decoration:none;">
        📄 Download Import Log
      </a>
    </div>
  `;
  
  showToast(`Imported ${imported} transactions!`);
  
  // Reset
  importData = null;
  document.getElementById('csv-file-input').value = '';
  
  // Store log URL for cleanup later
  window.importLogUrl = logUrl;
}

function cancelImport() {
  importData = null;
  document.getElementById('import-status').style.display = 'none';
  document.getElementById('import-complete').style.display = 'none';
  document.getElementById('csv-file-input').value = '';
  showToast('Import cancelled');
}

// ============================================================
// DELETE ALL DATA (DANGER ZONE)
// ============================================================

async function initiateDeleteAllData() {
  // First warning - explain what will be deleted
  openModal(`
    <h2 class="modal-title" style="color:var(--danger);">⚠️ Delete All Data</h2>
    <div style="margin-bottom:20px;">
      <p style="margin-bottom:16px; font-weight:600;">
        You are about to permanently delete ALL data from your salon app.
      </p>
      
      <div style="background:var(--bg-secondary); padding:16px; border-radius:8px; margin-bottom:16px;">
        <div style="font-weight:600; margin-bottom:12px;">This will delete:</div>
        <ul style="padding-left:20px; margin-bottom:0;">
          <li style="margin-bottom:8px;">All ${await db.transactions.count()} transactions</li>
          <li style="margin-bottom:8px;">All ${await db.monthlyExpenses.count()} monthly expenses</li>
          <li style="margin-bottom:8px;">All ${await db.renters.count()} booth renters</li>
          <li style="margin-bottom:8px;">All custom income/expense categories</li>
          <li style="margin-bottom:8px;">All data from Firebase cloud storage</li>
          <li style="margin-bottom:8px;">All data from local storage</li>
        </ul>
      </div>
      
      <div style="background:#ffebee; border:2px solid var(--danger); padding:16px; border-radius:8px; margin-bottom:20px;">
        <div style="color:var(--danger); font-weight:600; margin-bottom:8px;">
          ⚠️ THIS ACTION CANNOT BE UNDONE
        </div>
        <div style="font-size:14px; color:#666;">
          Once deleted, your data is gone forever. There is no backup or recovery option.
          Make sure you have exported any reports you need before proceeding.
        </div>
      </div>
    </div>
    
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">
        Cancel (Keep My Data)
      </button>
      <button type="button" class="btn-danger" style="flex:1;" onclick="confirmDeleteAllData()">
        Continue to Delete
      </button>
    </div>
  `);
}

function confirmDeleteAllData() {
  // Second warning - type confirmation
  openModal(`
    <h2 class="modal-title" style="color:var(--danger);">⚠️ Final Confirmation Required</h2>
    <div style="margin-bottom:20px;">
      <p style="margin-bottom:16px;">
        This is your last chance to cancel. All your salon data will be permanently deleted.
      </p>
      
      <div style="background:#ffebee; border:2px solid var(--danger); padding:16px; border-radius:8px; margin-bottom:16px;">
        <div style="color:var(--danger); font-weight:600; margin-bottom:8px; font-size:16px;">
          ⚠️ THIS WILL DELETE EVERYTHING
        </div>
        <div style="font-size:14px; color:#666;">
          To confirm, type <strong>DELETE ALL DATA</strong> in the box below:
        </div>
      </div>
      
      <div class="form-group">
        <input 
          type="text" 
          id="delete-confirmation-input" 
          class="form-input" 
          placeholder="Type: DELETE ALL DATA"
          style="border:2px solid var(--danger);"
        >
      </div>
    </div>
    
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn-secondary" style="flex:1;" onclick="closeModal()">
        Cancel (I Changed My Mind)
      </button>
      <button type="button" class="btn-danger" style="flex:1;" onclick="executeDeleteAllData()">
        Permanently Delete Everything
      </button>
    </div>
  `);
  
  // Focus the input
  setTimeout(() => {
    document.getElementById('delete-confirmation-input')?.focus();
  }, 100);
}

async function executeDeleteAllData() {
  // Check typed confirmation
  const input = document.getElementById('delete-confirmation-input');
  const typed = input?.value.trim();
  
  if (typed !== 'DELETE ALL DATA') {
    showToast('Please type "DELETE ALL DATA" to confirm');
    return;
  }
  
  closeModal();
  
  // Show progress
  openModal(`
    <h2 class="modal-title">Deleting All Data...</h2>
    <div style="text-align:center; padding:32px;">
      <div style="font-size:48px; margin-bottom:16px;">🔄</div>
      <div style="font-size:16px; margin-bottom:8px;">Deleting all data from database...</div>
      <div style="font-size:14px; color:var(--text-muted);">Please wait, this may take a minute.</div>
    </div>
  `);
  
  try {
    let deletedCount = 0;
    
    // Delete all transactions from Firebase
    const txnsSnapshot = await firestore.collection('users').doc(currentUser.uid).collection('transactions').get();
    for (const doc of txnsSnapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }
    
    // Delete all monthly expenses from Firebase
    const expensesSnapshot = await firestore.collection('users').doc(currentUser.uid).collection('monthlyExpenses').get();
    for (const doc of expensesSnapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }
    
    // Delete all renters from Firebase
    const rentersSnapshot = await firestore.collection('users').doc(currentUser.uid).collection('renters').get();
    for (const doc of rentersSnapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }
    
    // Delete all rent payments from Firebase
    const rentPaymentsSnapshot = await firestore.collection('users').doc(currentUser.uid).collection('rentPayments').get();
    for (const doc of rentPaymentsSnapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }
    
    // Delete all daily summaries from Firebase
    const dailySummarySnapshot = await firestore.collection('users').doc(currentUser.uid).collection('dailySummary').get();
    for (const doc of dailySummarySnapshot.docs) {
      await doc.ref.delete();
      deletedCount++;
    }
    
    // Delete categories from Firebase
    await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').delete().catch(() => {});
    
    // Clear IndexedDB
    await db.transactions.clear();
    await db.monthlyExpenses.clear();
    await db.renters.clear();
    await db.rentPayments.clear();
    await db.dailySummary.clear();
    
    // Reset categories to defaults
    state.categories = {
      INCOME: ['Haircut', 'Color', 'Other'],
      DAILY_EXPENSE: ['Products', 'Supplies', 'Other'],
      MONTHLY_EXPENSE: ['Rent', 'Utilities', 'Insurance', 'Other']
    };
    
    // Save default categories
    await saveCategories();
    
    // Clear localStorage
    localStorage.removeItem('selectedDate');
    
    closeModal();
    
    // Show success
    openModal(`
      <h2 class="modal-title" style="color:var(--success);">✅ All Data Deleted</h2>
      <div style="text-align:center; padding:32px;">
        <div style="font-size:48px; margin-bottom:16px;">✅</div>
        <div style="font-size:18px; font-weight:600; margin-bottom:8px;">
          Database Reset Complete
        </div>
        <div style="font-size:14px; color:var(--text-muted); margin-bottom:20px;">
          Deleted ${deletedCount} items. Your app is now empty and ready for fresh data.
        </div>
        <button class="btn-primary" onclick="closeModal(); navigate('daily')">
          Start Fresh
        </button>
      </div>
    `);
    
    showToast('All data deleted successfully');
    
  } catch (err) {
    console.error('Error deleting all data:', err);
    closeModal();
    openModal(`
      <h2 class="modal-title" style="color:var(--danger);">Error</h2>
      <div style="padding:20px;">
        <p style="margin-bottom:16px;">An error occurred while deleting data:</p>
        <p style="background:var(--bg-secondary); padding:12px; border-radius:4px; font-family:monospace; font-size:13px; margin-bottom:16px;">
          ${err.message}
        </p>
        <button class="btn-primary" onclick="closeModal()">Close</button>
      </div>
    `);
  }
}

console.log('Mane Frame Salon Desktop (Full Featured + Reversible Import + Delete All) - Ready');
console.log('Keyboard Shortcuts:');
console.log('  Ctrl+I = Add Income');
console.log('  Ctrl+E = Add Expense');
console.log('  Ctrl+D = Daily View');
console.log('  Ctrl+M = Monthly View');
console.log('  Ctrl+R = Reports View');
// COMPREHENSIVE CATEGORY DEBUGGING TOOL
// Add this to app.js temporarily to diagnose the exact issue

async function fullCategoryDiagnosis() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE CATEGORY DIAGNOSIS');
  console.log('='.repeat(80));
  
  // 1. Check current state
  console.log('\n1. CURRENT STATE (Desktop):');
  console.log('state.categories:', JSON.parse(JSON.stringify(state.categories)));
  console.log('INCOME count:', state.categories.INCOME?.length);
  console.log('EXPENSE count:', state.categories.EXPENSE?.length);
  console.log('EXPENSE list:', state.categories.EXPENSE);
  
  // 2. Check Firebase
  console.log('\n2. FIREBASE DATA:');
  try {
    const doc = await firestore.collection('users').doc(currentUser.uid).collection('settings').doc('categories').get();
    if (doc.exists) {
      const fbData = doc.data();
      console.log('Raw Firebase data:', JSON.parse(JSON.stringify(fbData)));
      
      console.log('\nFirebase fields present:');
      console.log('- Has INCOME?', !!fbData.INCOME, fbData.INCOME?.length || 0);
      console.log('- Has EXPENSE?', !!fbData.EXPENSE, fbData.EXPENSE?.length || 0);
      console.log('- Has DAILY_EXPENSE?', !!fbData.DAILY_EXPENSE, fbData.DAILY_EXPENSE?.length || 0);
      console.log('- Has MONTHLY_EXPENSE?', !!fbData.MONTHLY_EXPENSE, fbData.MONTHLY_EXPENSE?.length || 0);
      
      if (fbData.EXPENSE) {
        console.log('\nFirebase EXPENSE categories:', fbData.EXPENSE);
      }
      if (fbData.DAILY_EXPENSE) {
        console.log('\nFirebase DAILY_EXPENSE categories:', fbData.DAILY_EXPENSE);
      }
      if (fbData.MONTHLY_EXPENSE) {
        console.log('\nFirebase MONTHLY_EXPENSE categories:', fbData.MONTHLY_EXPENSE);
      }
    } else {
      console.log('NO CATEGORIES DOCUMENT IN FIREBASE!');
    }
  } catch (err) {
    console.error('Error reading Firebase:', err);
  }
  
  // 3. Check IndexedDB
  console.log('\n3. INDEXEDDB DATA:');
  try {
    const localSettings = await db.settings.toArray();
    console.log('Local settings:', localSettings);
    const catSettings = localSettings.find(s => s.key === 'categories');
    if (catSettings) {
      const localCats = JSON.parse(catSettings.value);
      console.log('IndexedDB categories:', localCats);
    } else {
      console.log('No categories in IndexedDB');
    }
  } catch (err) {
    console.error('Error reading IndexedDB:', err);
  }
  
  // 4. What mobile should have
  console.log('\n4. EXPECTED MOBILE CATEGORIES (from screenshot):');
  const mobileCategories = [
    'Supplies', 'Products', 'Tools/Equipment', 'Advertising',
    'Education', 'Meals', 'Employee Pay', 'Misc Daily',
    'Rent', 'Electric', 'Water', 'Gas', 'Insurance',
    'Cleaning Service', 'Booking Software', 'Phone',
    'Marketing', 'Misc Monthly'
  ];
  console.log('Mobile has:', mobileCategories);
  console.log('Mobile count:', mobileCategories.length);
  
  // 5. What's missing
  console.log('\n5. MISSING FROM DESKTOP:');
  const desktopHas = state.categories.EXPENSE || [];
  const missing = mobileCategories.filter(cat => !desktopHas.includes(cat));
  console.log('Missing categories:', missing);
  console.log('Missing count:', missing.length);
  
  // 6. What desktop has that mobile doesn't
  console.log('\n6. EXTRA ON DESKTOP:');
  const extra = desktopHas.filter(cat => !mobileCategories.includes(cat));
  console.log('Extra categories:', extra);
  
  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSIS COMPLETE - Check console above');
  console.log('='.repeat(80));
  
  return {
    desktopCount: desktopHas.length,
    mobileCount: mobileCategories.length,
    missing: missing,
    extra: extra
  };
}

// Function to force merge with mobile's categories
async function forceFixCategories() {
  const mobileCategories = [
    'Supplies', 'Products', 'Tools/Equipment', 'Advertising',
    'Education', 'Meals', 'Employee Pay', 'Misc Daily',
    'Rent', 'Electric', 'Water', 'Gas', 'Insurance',
    'Cleaning Service', 'Booking Software', 'Phone',
    'Marketing', 'Misc Monthly'
  ];
  
  console.log('FORCING FIX: Setting EXPENSE to match mobile...');
  console.log('Before:', state.categories.EXPENSE?.length);
  
  state.categories.EXPENSE = mobileCategories;
  
  console.log('After:', state.categories.EXPENSE?.length);
  
  await saveCategories();
  
  console.log('Categories saved to Firebase. Refreshing UI without reloading...');
  
  // Re-render the settings page WITHOUT calling loadCategories()
  // Just update the UI directly
  const incomeContainer = document.getElementById('income-categories');
  const expenseContainer = document.getElementById('all-expense-categories');
  
  if (incomeContainer) {
    incomeContainer.innerHTML = state.categories.INCOME.map((cat, idx) => `
      <div class="category-tag">
        ${cat}
        <button onclick="removeCategory('INCOME', ${idx})" class="category-remove">×</button>
      </div>
    `).join('');
  }
  
  if (expenseContainer) {
    expenseContainer.innerHTML = state.categories.EXPENSE.map((cat, idx) => `
      <div class="category-tag">
        ${cat}
        <button onclick="removeCategory('EXPENSE', ${idx})" class="category-remove">×</button>
      </div>
    `).join('');
  }
  
  // Update the count in the header
  const expenseHeader = document.querySelector('.card h3');
  if (expenseHeader && expenseHeader.textContent.includes('Expense Categories')) {
    expenseHeader.textContent = `Expense Categories (${state.categories.EXPENSE.length} total)`;
  }
  
  showToast(`Categories synced! Desktop now has ${mobileCategories.length} expense categories.`);
  console.log('Force fix complete!');
}
