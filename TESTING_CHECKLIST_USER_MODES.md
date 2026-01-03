# Testing Checklist: Agency vs Regular User Modes

## Pre-Testing Setup

```bash
# Start development server
npm run dev

# Open browser
http://localhost:3000
```

---

## Test Suite 1: Regular User (Single Account)

### 1.1 New User Signup
- [ ] Go to sign-in page
- [ ] Sign up with new email
- [ ] Verify email verification works
- [ ] Successfully redirected to dashboard

**Expected Result:** ✅ User created with 1 default organization

### 1.2 Navigation Bar
- [ ] Look at navigation bar
- [ ] Find account display area

**Expected Result:**
```
✅ Shows: [Building Icon] "My Organization" or similar
✅ No dropdown arrow
✅ Non-interactive (can't click to switch)
```

### 1.3 Settings Page
- [ ] Click "Settings" in navigation
- [ ] Go to "Accounts" tab (or similar)

**Expected Result:**
```
✅ Title: "Your Organizations"
✅ Description mentions "organization" not "client"
✅ Create form: "Create New Organization"
✅ Input placeholder: "Organization name..."
```

### 1.4 Upload Asset
- [ ] Go to upload page
- [ ] Upload a test asset
- [ ] Verify it processes successfully

**Expected Result:**
```
✅ Asset uploads to the single account
✅ Asset appears in dashboard
✅ No account confusion
```

---

## Test Suite 2: Transition to Agency User

### 2.1 Create Second Account
- [ ] Stay logged in as regular user from Test Suite 1
- [ ] Go to Settings > Accounts
- [ ] Enter a client name (e.g., "Test Client B")
- [ ] Click "Create"

**Expected Result:**
```
✅ Account created successfully
✅ Success message shows
✅ Page may reload
```

### 2.2 Verify UI Adaptation
- [ ] Return to dashboard or main page
- [ ] Look at navigation bar

**Expected Result:**
```
✅ Account display changed to DROPDOWN
✅ Shows: [Building Icon] "Account Name" [Dropdown Arrow]
✅ Is interactive (can click)
```

### 2.3 Open Account Switcher
- [ ] Click on account switcher in navigation
- [ ] View dropdown menu

**Expected Result:**
```
✅ Dropdown opens
✅ Shows both accounts (original + Test Client B)
✅ Current account has checkmark
✅ Search box placeholder: "Search clients..." (uses "clients")
✅ Shows roles (Owner, Admin, Member) if applicable
✅ Quick create section at bottom
```

### 2.4 Settings Page Updated
- [ ] Go to Settings > Accounts

**Expected Result:**
```
✅ Title changed to: "Your Clients"
✅ Description mentions "clients" not "organizations"
✅ Create form: "Create New Client"
✅ Input placeholder: "Client name..."
✅ Success message: "Client created successfully!"
```

---

## Test Suite 3: Account Switching & Data Isolation

### 3.1 Upload Asset to Account A
- [ ] Switch to first account (if not already there)
- [ ] Upload a test asset named "Asset A"
- [ ] Wait for processing to complete
- [ ] Go to dashboard
- [ ] Verify "Asset A" is visible

**Expected Result:**
```
✅ Asset A uploaded successfully
✅ Appears in dashboard for Account A
```

### 3.2 Switch to Account B
- [ ] Click account switcher
- [ ] Select the second account (Test Client B)
- [ ] Page should reload

**Expected Result:**
```
✅ Page reloads with new account context
✅ Account switcher shows "Test Client B" selected
```

### 3.3 Verify Data Isolation
- [ ] Go to dashboard
- [ ] Look for "Asset A"

**Expected Result:**
```
✅ "Asset A" NOT visible (isolated to Account A)
✅ Dashboard is empty or shows different assets
✅ No data leakage between accounts
```

### 3.4 Upload Asset to Account B
- [ ] Upload a different asset named "Asset B"
- [ ] Wait for processing
- [ ] Verify "Asset B" appears in dashboard

**Expected Result:**
```
✅ Asset B uploaded successfully
✅ Appears in dashboard for Account B
✅ Still no "Asset A" visible
```

### 3.5 Switch Back to Account A
- [ ] Click account switcher
- [ ] Select first account again
- [ ] Page reloads

**Expected Result:**
```
✅ Page reloads
✅ "Asset A" visible again
✅ "Asset B" NOT visible (isolated to Account B)
✅ Clean data separation confirmed
```

---

## Test Suite 4: Multi-Account Features

### 4.1 Create Third Account
- [ ] Go to Settings > Accounts
- [ ] Create "Test Client C"

**Expected Result:**
```
✅ Third account created
✅ All 3 accounts show in switcher
✅ Can switch between all three
```

### 4.2 Search Functionality
- [ ] Open account switcher dropdown
- [ ] Type in search box

**Expected Result:**
```
✅ Search filters accounts by name
✅ Shows relevant results only
✅ Can select from filtered results
```

### 4.3 Quick Create from Switcher
- [ ] Open account switcher dropdown
- [ ] Scroll to bottom
- [ ] Find "Create new" section
- [ ] Type "Quick Client D"
- [ ] Click + icon

**Expected Result:**
```
✅ Account created from switcher
✅ Automatically switches to new account
✅ Now managing 4 accounts total
```

---

## Test Suite 5: Edge Cases

### 5.1 Delete Accounts Back to One
- [ ] Go to Settings > Accounts
- [ ] Delete all accounts except one
- [ ] Return to main page

**Expected Result:**
```
✅ Account switcher returns to simple mode
✅ No dropdown arrow
✅ UI reverts to "Organizations" terminology
✅ Settings page shows "Your Organizations"
```

### 5.2 Session Persistence
- [ ] Switch to a specific account
- [ ] Refresh browser (F5)

**Expected Result:**
```
✅ Same account still selected
✅ No unexpected account switches
✅ Data still properly isolated
```

### 5.3 Multiple Browser Tabs
- [ ] Open app in two tabs
- [ ] Switch account in Tab 1
- [ ] Reload Tab 2

**Expected Result:**
```
✅ Tab 2 reflects account change from Tab 1
✅ Both tabs stay in sync
```

---

## Test Suite 6: Terminology Consistency

### 6.1 With 1 Account (Regular User)

Verify terminology in:
- [ ] Navigation account display
- [ ] Settings > Accounts page title
- [ ] Settings > Accounts description
- [ ] Create account form title
- [ ] Create account form placeholder
- [ ] Success messages

**Expected:** All say "Organization" or "Account"

### 6.2 With 2+ Accounts (Agency User)

Verify terminology in:
- [ ] Navigation account switcher
- [ ] Settings > Accounts page title
- [ ] Settings > Accounts description  
- [ ] Create account form title
- [ ] Create account form placeholder
- [ ] Success messages
- [ ] Search placeholder

**Expected:** All say "Client"

---

## Test Suite 7: Role-Based Features

### 7.1 Role Display
- [ ] Open account switcher
- [ ] Look at each account listing

**Expected Result:**
```
✅ Shows role badges (Owner, Admin, Member)
✅ First account shows "Owner"
✅ Created accounts show "Owner"
```

### 7.2 Admin-Only Features (Future)
- [ ] Try to delete an account where you're MEMBER (if possible)

**Expected Result:**
```
✅ Only OWNER can delete accounts
✅ Appropriate error messages
```

---

## Test Suite 8: Mobile Responsiveness

### 8.1 Mobile Navigation
- [ ] Resize browser to mobile width (< 768px)
- [ ] Open navigation menu

**Expected Result:**
```
✅ Account switcher still visible
✅ Works properly in mobile menu
✅ Touch-friendly (min 44px tap targets)
```

### 8.2 Account Switcher on Mobile
- [ ] Tap account switcher
- [ ] Try switching accounts

**Expected Result:**
```
✅ Dropdown opens properly
✅ All accounts accessible
✅ No layout issues
✅ Scrolling works if many accounts
```

---

## Test Suite 9: Accessibility

### 9.1 Keyboard Navigation
- [ ] Use Tab key to navigate
- [ ] Try accessing account switcher
- [ ] Use Enter/Space to open dropdown
- [ ] Use arrow keys to navigate accounts

**Expected Result:**
```
✅ All elements keyboard accessible
✅ Proper focus indicators
✅ Logical tab order
```

### 9.2 Screen Reader (Optional)
- [ ] Enable screen reader
- [ ] Navigate to account switcher
- [ ] Listen to announcements

**Expected Result:**
```
✅ Proper ARIA labels
✅ Account names announced
✅ Role information available
```

---

## Test Suite 10: Performance

### 10.1 Account Creation Speed
- [ ] Create 5 accounts in quick succession
- [ ] Note response times

**Expected Result:**
```
✅ Each creation < 2 seconds
✅ UI remains responsive
✅ No errors or hangs
```

### 10.2 Account Switching Speed
- [ ] Switch between accounts rapidly

**Expected Result:**
```
✅ Switch + reload < 3 seconds
✅ Smooth transitions
✅ No data loss
```

---

## Bug Reporting Template

If you find issues, document them:

```markdown
## Bug: [Brief Description]

**Test Suite:** [Suite Number]
**Severity:** Critical / High / Medium / Low

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happened

**Screenshots:**
[Attach if helpful]

**Browser/Device:**
[e.g., Chrome 120, Safari iOS 17]

**Account State:**
[e.g., 1 account, 3 accounts, specific configuration]
```

---

## Success Criteria

✅ **All tests passed** - Ready for production
⚠️ **Minor issues** - Document and fix
❌ **Critical issues** - Must fix before launch

---

## Quick Test (5 minutes)

If short on time, test these critical paths:

1. [ ] Sign up → Verify 1 account created
2. [ ] Create 2nd account → Verify UI switches to dropdown
3. [ ] Upload asset to Account A
4. [ ] Switch to Account B → Verify asset NOT visible
5. [ ] Check Settings page → Verify "Your Clients" terminology

If these 5 pass, core functionality is working! ✅

---

**Testing Date:** _____________  
**Tested By:** _____________  
**Environment:** Dev / Staging / Production  
**Build Version:** _____________  

**Overall Result:** ✅ Pass / ⚠️ Issues Found / ❌ Failed

**Notes:**
_____________________________________________
_____________________________________________
