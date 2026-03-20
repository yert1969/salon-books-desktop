# MANE FRAME SALON - DESKTOP APP
## Setup & Deployment Instructions

---

## 🎯 What You're Getting

A **desktop-optimized web interface** for your salon app with:
- ✅ Same Firebase backend as mobile (data syncs automatically)
- ✅ Quick transaction entry with keyboard shortcuts
- ✅ Data tables for easy scanning
- ✅ Sidebar navigation
- ✅ Larger forms optimized for typing

---

## 📋 Prerequisites

1. Your mobile app is already deployed and working
2. You have a GitHub account
3. You know your GitHub username

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Create New GitHub Repository

1. Go to https://github.com/new
2. **Repository name:** `salon-books-desktop`
3. **Public** (important for GitHub Pages)
4. **Do NOT** initialize with README
5. Click **Create repository**

---

### Step 2: Upload Desktop App Files

**Option A: Using GitHub Web Interface (Easiest)**

1. On your new repository page, click **uploading an existing file**
2. Drag and drop all these files:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `icon-192.png` (optional)
   - `icon-512.png` (optional)
3. Scroll down and click **Commit changes**

**Option B: Using Git Command Line**

```bash
# Extract the zip file
unzip mane-frame-desktop.zip -d salon-books-desktop

# Navigate to folder
cd salon-books-desktop

# Initialize git
git init

# Add files
git add .

# Commit
git commit -m "Initial desktop app"

# Connect to GitHub (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/salon-books-desktop.git

# Push
git branch -M main
git push -u origin main
```

---

### Step 3: Enable GitHub Pages

1. In your repository, click **Settings**
2. Click **Pages** (left sidebar)
3. Under **Source**, select:
   - Branch: **main**
   - Folder: **/ (root)**
4. Click **Save**
5. Wait 1-2 minutes for deployment

---

### Step 4: Find Your Desktop App URL

Your desktop app will be at:
```
https://YOUR_USERNAME.github.io/salon-books-desktop
```

Example: If your username is `yert1969`, the URL is:
```
https://yert1969.github.io/salon-books-desktop
```

---

### Step 5: Add to Firebase Authorized Domains

**CRITICAL:** Firebase needs to allow your desktop app URL

1. Go to https://console.firebase.google.com
2. Select your project: **mane-frame-salon**
3. Click **Authentication** (left sidebar)
4. Click **Settings** tab
5. Scroll to **Authorized domains**
6. Click **Add domain**
7. Enter: `YOUR_USERNAME.github.io`
8. Click **Add**

Example: Add `yert1969.github.io`

---

## ✅ TESTING

1. **Open desktop app** in browser:
   ```
   https://YOUR_USERNAME.github.io/salon-books-desktop
   ```

2. **Sign in** with Google (same account as mobile)

3. **Verify data sync:**
   - You should see today's transactions from mobile
   - Add a transaction on desktop
   - Open mobile app → should appear there too!

---

## 🎹 KEYBOARD SHORTCUTS

- **Ctrl+I** (or Cmd+I on Mac) → Quick add Income
- **Ctrl+E** (or Cmd+E on Mac) → Quick add Expense
- **Tab** → Move between fields
- **Enter** → Submit form

---

## 📱 HOW DATA SYNC WORKS

### Same Firebase Backend
```
Mobile App    →  Firebase  ←  Desktop App
(Phone)           (Cloud)      (Laptop)
```

### Real-Time Example
1. **9:00 AM** - Add transaction on laptop
2. **9:00 AM** - Syncs to Firebase immediately
3. **10:00 AM** - Open mobile app
4. **10:00 AM** - Transaction appears automatically

**Works both ways!**
- Laptop → Phone ✓
- Phone → Laptop ✓

---

## 🔒 SECURITY

- Same Google Sign-In as mobile app
- Same Firestore security rules
- Each user only sees their own data
- HTTPS encryption (GitHub Pages provides SSL)

---

## 📁 FILE STRUCTURE

```
salon-books-desktop/
├── index.html       # Main HTML (sidebar layout)
├── styles.css       # Desktop-optimized styling
├── app.js           # Same Firebase config as mobile
├── icon-192.png     # App icon (optional)
└── icon-512.png     # App icon (optional)
```

---

## 🔄 UPDATING THE DESKTOP APP

When you want to update the desktop app:

1. **Edit files locally** or in GitHub web interface
2. **Commit changes** to main branch
3. **Wait 1-2 minutes** for GitHub Pages to redeploy
4. **Hard refresh** browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

---

## 🆘 TROUBLESHOOTING

### Problem: "Sign in failed"
**Solution:** Make sure you added your GitHub Pages domain to Firebase Authorized Domains (Step 5)

### Problem: "No data appearing"
**Solution:** 
1. Check that you're signed in with the same Google account
2. Open browser console (F12) and look for errors
3. Make sure mobile app has some transactions

### Problem: "Page not found"
**Solution:**
1. Wait 2-3 minutes after enabling GitHub Pages
2. Check URL is exactly: `https://USERNAME.github.io/salon-books-desktop`
3. Make sure repository is **public**

### Problem: White screen
**Solution:**
1. Open browser console (F12)
2. Look for Firebase errors
3. Check firebaseConfig in app.js matches your project

---

## 📊 FEATURES BY VIEW

### Daily View
- ✅ Quick add income/expense form
- ✅ Today's summary cards (income, expenses, net)
- ✅ Transaction table with delete buttons
- ✅ Keyboard shortcuts

### Monthly View
- ✅ Add monthly expenses
- ✅ View all expenses for current month
- ✅ Monthly total summary

### Renters View
- ✅ View booth renters
- ✅ Weekly rent amounts
- 📱 Add/edit renters on mobile app

### Reports View
- 📱 Full reports available on mobile app
- Desktop shows placeholder

### Settings View
- ℹ️ App information
- 📱 Manage categories on mobile app

---

## 💡 TIPS

1. **Bookmark the desktop URL** for quick access
2. **Keep mobile app** for reports and charts
3. **Use desktop** for fast data entry when at computer
4. **Both interfaces** are always in sync
5. **Works offline** (data syncs when back online)

---

## 🎨 CUSTOMIZATION

To customize the app:

1. Edit `styles.css` to change colors
2. Edit `app.js` to modify behavior
3. Commit changes to GitHub
4. Hard refresh browser to see updates

---

## 📞 SUPPORT

If you run into issues:
1. Check browser console for errors (F12)
2. Verify Firebase Authorized Domains
3. Make sure you're using the correct GitHub Pages URL
4. Try in incognito mode to rule out browser cache

---

## ✨ WHAT'S NEXT?

**Currently included:**
- ✅ Daily transaction entry
- ✅ Monthly expense tracking
- ✅ Renters view
- ✅ Keyboard shortcuts

**Future additions (optional):**
- 📊 Desktop reports with charts
- 📝 Inline editing of transactions
- 🔍 Search and filter
- 📅 Date range picker
- 📈 Weekly summary view

Let me know if you want any of these features!

---

## 🎉 YOU'RE DONE!

Your desktop app is now live at:
```
https://YOUR_USERNAME.github.io/salon-books-desktop
```

Sign in with Google and start using it! 🎊
