# Agency vs Regular Users - Implementation Summary

## Overview

This document summarizes the implementation of adaptive UI features to accommodate both **agency users** (managing multiple client organizations) and **regular users** (single organization).

## What Was Implemented

### 1. User Type Detection Utilities (`lib/user-utils.ts`)

Created comprehensive utilities for detecting and handling different user types:

**Core Functions:**
- `getUserMode(accounts)` - Returns "agency" or "regular" based on account count
- `isAgencyUser(accounts)` - Boolean check for agency users
- `isRegularUser(accounts)` - Boolean check for regular users
- `getAccountTerminology(mode)` - Returns appropriate terminology
- `getAccountSwitcherMode(accounts)` - Returns "full", "simple", or "hidden"
- `shouldShowAccountSwitcher(accounts)` - Determines visibility
- Role and permission helpers

**Terminology Mapping:**

| Context | Agency Term | Regular Term |
|---------|-------------|--------------|
| Single | Client | Organization |
| Plural | Clients | Organizations |
| Action | Manage Clients | Account Settings |
| Create | Add Client | Create Organization |
| Switch | Switch Client | Switch Organization |

### 2. Adaptive Account Switcher (`components/AccountSwitcher.tsx`)

Enhanced the account switcher with three modes:

**Mode 1: Full Switcher (Agency Users - 2+ accounts)**
- Full dropdown with all accounts
- Search functionality
- Create new account inline
- Shows roles for each account
- Dynamic terminology ("Clients" for agencies)

**Mode 2: Simple Display (Regular Users - 1 account)**
- Shows current account name only
- No dropdown or switching UI
- Simplified, non-interactive display
- Saves screen space

**Mode 3: Hidden (No accounts)**
- Doesn't render anything
- Handled by account creation flow

**Features:**
- `forceFullMode` prop - Forces full switcher even for single account (useful in settings)
- Dynamic placeholders based on user type
- Agency-specific terminology throughout

### 3. Enhanced Accounts Management Page (`app/settings/accounts/page.tsx`)

Updated the accounts management page to use adaptive terminology:

**Dynamic Content:**
- Page title: "Your Clients" (agency) vs "Your Organizations" (regular)
- Description adapted to user type
- Empty states reflect appropriate terminology
- Context-aware guidance

**Implementation:**
```typescript
const userMode = getUserMode(accounts);
const terminology = getAccountTerminology(userMode);
```

### 4. Adaptive Account Creation Form (`components/accounts/CreateAccountForm.tsx`)

Updated create account form with:

**Dynamic Elements:**
- Title: "Create New Client" (agency) vs "Create New Organization" (regular)
- Description tailored to use case
- Placeholder text adapted
- Success messages customized
- Next steps guidance (configure client vs company context)

**Accepts Terminology Prop:**
```typescript
<CreateAccountForm 
  onCreateAccount={handleCreateAccount}
  terminology={{
    account: terminology.account,
    accounts: terminology.accounts,
  }}
/>
```

## Architecture Decisions

### Why Dynamic Detection vs User Type Field?

**Decision: Use dynamic detection based on account count**

**Rationale:**
1. **Simpler** - No database migration needed
2. **Flexible** - Users can organically transition from regular to agency
3. **Automatic** - No user input or configuration required
4. **Accurate** - Account count is always up-to-date

**Alternative (Future):**
Add optional `userType` field to User model for:
- Analytics tracking
- Marketing segmentation
- Proactive feature enablement

### Account Switcher Visibility Strategy

**For Navigation (main UI):**
- Hide for single-account users (simple mode)
- Show full switcher for multi-account users

**For Settings Page:**
- Always show full switcher (use `forceFullMode={true}`)
- Allows users to easily create additional accounts

**Rationale:**
- Reduces cognitive load for regular users
- Keeps UI focused on core tasks
- Settings is the appropriate place for account management

## User Experience Flow

### Scenario 1: New Regular User

```
1. Sign up → Creates default organization
2. Sees: Simple account display (organization name)
3. UI Focus: Asset upload, brand setup
4. Settings page: Can create more orgs if needed
5. If creates 2nd org → Automatically becomes agency user
```

### Scenario 2: New Agency User

```
1. Sign up → Creates agency organization
2. Creates client accounts → Sees full switcher appear
3. UI Focus: Client management, switching between clients
4. Can invite team members and clients to respective accounts
5. Terminology adapts: "Clients" instead of "Organizations"
```

### Scenario 3: Transition from Regular to Agency

```
1. Starts as regular user (1 org)
2. Decides to manage client → Creates 2nd account
3. UI automatically adapts:
   - Account switcher appears in navigation
   - Terminology changes to "Clients"
   - Settings page shows client management focus
4. Seamless transition, no migration needed
```

## Testing Guide

### Test Case 1: Single Account User (Regular)

**Setup:**
1. Sign up with new account
2. Verify only 1 organization created

**Expected Behavior:**
- ✅ Navigation shows simple account display (not dropdown)
- ✅ Account name visible but non-interactive
- ✅ Settings page shows "Your Organizations"
- ✅ Create form says "Create New Organization"
- ✅ Terminology uses "Organization" throughout

**Test:**
```bash
# After signup, check navigation
- Should see: [Building Icon] "My Organization"
- Should NOT see: Dropdown arrow or switcher

# Visit /settings/accounts
- Title: "Your Organizations"
- Create form: "Create New Organization"
- Can still create additional accounts (becomes agency)
```

### Test Case 2: Multi-Account User (Agency)

**Setup:**
1. Sign up with new account
2. Create 2 additional client accounts

**Expected Behavior:**
- ✅ Navigation shows full account switcher dropdown
- ✅ Settings page shows "Your Clients"
- ✅ Create form says "Create New Client"
- ✅ Terminology uses "Client" throughout
- ✅ Can search and switch between accounts

**Test:**
```bash
# Check navigation
- Should see: [Building Icon] "Client Name" [Dropdown Arrow]
- Click dropdown → Shows all 3 accounts
- Search box placeholder: "Search clients..."

# Visit /settings/accounts
- Title: "Your Clients"
- Description: "Manage your clients..."
- Create form: "Create New Client"
- Placeholder: "Client name (e.g., Acme Corp (Client))"
```

### Test Case 3: Account Switching

**Setup:**
1. Agency user with 3 accounts
2. Upload assets to Account A

**Expected Behavior:**
- ✅ Assets only visible in Account A
- ✅ Switch to Account B → different/empty asset list
- ✅ Current account persists after page reload
- ✅ All API calls use correct accountId

**Test:**
```bash
# In Account A
1. Upload asset "Test Asset A"
2. Verify asset appears in dashboard

# Switch to Account B
3. Click account switcher
4. Select "Account B"
5. Page reloads
6. Verify "Test Asset A" NOT visible
7. Upload "Test Asset B"

# Switch back to Account A
8. Click account switcher
9. Select "Account A"
10. Verify only "Test Asset A" visible (not "Test Asset B")
```

### Test Case 4: Terminology Consistency

**Setup:**
1. Create user with 2 accounts (agency mode)

**Expected Behavior:**
- ✅ All UI uses "Client" terminology consistently

**Test Locations:**
```bash
# Check terminology in:
✓ Navigation account switcher
✓ Settings > Accounts page title
✓ Settings > Accounts page description
✓ Create account form title
✓ Create account form placeholder
✓ Create account form success message
✓ Search placeholder
✓ Empty states
```

### Test Case 5: Account Creation Flow

**Setup:**
1. New user (1 account)
2. Create 2nd account via settings

**Expected Behavior:**
- ✅ UI transitions from simple to full mode
- ✅ Terminology changes from "Organization" to "Client"
- ✅ Navigation updates automatically

**Test:**
```bash
# Before creating 2nd account
- Note: Simple account display in navigation
- Note: "Your Organizations" in settings

# Create 2nd account
1. Go to Settings > Accounts
2. Enter "Client B" in create form
3. Click "Create"
4. Wait for success message

# After creating 2nd account
- Verify: Full account switcher now visible in navigation
- Verify: Page title changed to "Your Clients"
- Verify: Can switch between accounts
```

### Test Case 6: Force Full Mode in Settings

**Setup:**
1. Regular user (1 account)
2. Visit settings page

**Expected Behavior:**
- ✅ Navigation shows simple display (regular user)
- ✅ Settings page still allows account creation
- ✅ User can create additional accounts easily

**Test:**
```bash
# Navigate to /settings/accounts
- Create form should be visible
- Can create new accounts
- After creating 2nd account → UI adapts to agency mode
```

## Code Examples

### Using User Mode Detection

```typescript
import { getUserMode, getAccountTerminology } from "@/lib/user-utils";

function MyComponent() {
  const { accounts } = useAccount();
  
  const userMode = getUserMode(accounts);
  const terminology = getAccountTerminology(userMode);
  
  return (
    <div>
      <h1>Your {terminology.accounts}</h1>
      {userMode === "agency" ? (
        <p>Manage your clients</p>
      ) : (
        <p>Manage your organization</p>
      )}
    </div>
  );
}
```

### Conditional Account Switcher

```typescript
import { getAccountSwitcherMode } from "@/lib/user-utils";

function Navigation() {
  const { accounts } = useAccount();
  const switcherMode = getAccountSwitcherMode(accounts);
  
  if (switcherMode === "hidden") return null;
  
  if (switcherMode === "simple") {
    return <SimpleAccountDisplay />;
  }
  
  return <FullAccountSwitcher />;
}
```

### Using Terminology in Components

```typescript
function CreateAccountForm({ terminology }) {
  return (
    <>
      <h2>Create New {terminology.account}</h2>
      <Input placeholder={`${terminology.account} name`} />
    </>
  );
}
```

## Known Limitations

### Current Implementation

1. **No User Type Persistence**
   - User type determined dynamically on each render
   - Could add optional `userType` field for analytics

2. **Simple Mode Non-Interactive**
   - Single-account users can't quick-switch (no accounts to switch to)
   - Must go to settings to create additional accounts

3. **No Account Creation Limits**
   - Any user can create unlimited accounts
   - Future: Add subscription-based limits

4. **No Agency-Specific Features**
   - Cross-client analytics
   - Template sharing
   - Bulk operations

### Future Enhancements

See `AGENCY_VS_REGULAR_USERS.md` for comprehensive roadmap.

## Best Practices for Developers

### Always Use Terminology Utilities

```typescript
// ❌ BAD: Hardcoded terminology
<h1>Your Accounts</h1>

// ✅ GOOD: Dynamic terminology
const terminology = getAccountTerminology(userMode);
<h1>Your {terminology.accounts}</h1>
```

### Check User Mode for Conditional Features

```typescript
// Show agency-specific features only when appropriate
if (isAgencyUser(accounts)) {
  // Show client analytics dashboard
}
```

### Use Account Switcher Props Appropriately

```typescript
// Navigation: Adaptive mode
<AccountSwitcher />

// Settings: Always show full mode
<AccountSwitcher forceFullMode={true} />
```

### Test Both User Types

Always test features with:
1. Single account (regular user)
2. Multiple accounts (agency user)
3. Transition from 1 to 2 accounts

## Migration Notes

### For Existing Users

**No migration needed!** The system automatically:
- Detects user type based on current accounts
- Adapts UI on next page load
- Preserves all existing data and functionality

### Backward Compatibility

✅ All existing features work as before
✅ No database changes required
✅ Existing accounts unaffected
✅ API routes unchanged

## Performance Considerations

### User Mode Detection

- **Cost:** Minimal (array length check)
- **Frequency:** Once per component render
- **Optimization:** Already memoized in context

### Account Switcher Modes

- **Simple mode:** Lighter DOM (no dropdown)
- **Full mode:** Standard Radix UI component
- **Hidden mode:** No render cost

## Accessibility

All implementations maintain accessibility:

- ✅ Proper ARIA labels
- ✅ Keyboard navigation
- ✅ Screen reader friendly
- ✅ Focus management
- ✅ Error announcements

## Summary

The implementation successfully accommodates both agency and regular users through:

1. **Smart Detection** - Automatic user type detection based on account count
2. **Adaptive UI** - Account switcher modes (full/simple/hidden)
3. **Dynamic Terminology** - Context-appropriate language throughout
4. **Seamless Transitions** - Organic progression from regular to agency
5. **Maintainable Code** - Centralized utilities for consistency

The architecture is flexible, maintainable, and provides excellent UX for both user types without requiring configuration or migration.

---

**Implementation Date:** January 1, 2026  
**Version:** 1.0  
**Status:** ✅ Complete and Ready for Testing
