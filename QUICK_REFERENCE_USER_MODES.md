# Quick Reference: Agency vs Regular User Modes

## TL;DR

The system automatically adapts to two user types based on account count:

| User Type | Account Count | UI Behavior |
|-----------|---------------|-------------|
| **Regular** | 1 account | Simple account display, focus on assets |
| **Agency** | 2+ accounts | Full account switcher, client management |

## Visual Examples

### Regular User (1 Account)

```
┌─────────────────────────────────────────────────┐
│  🏢 Asset Organizer                             │
│                                                 │
│  [📦 My Organization]  (non-interactive)        │
└─────────────────────────────────────────────────┘

Settings > Accounts:
┌─────────────────────────────────────────────────┐
│  Your Organizations                             │
│  Manage your organization settings              │
│                                                 │
│  Create New Organization                        │
│  [Organization name]  [Create]                  │
└─────────────────────────────────────────────────┘
```

### Agency User (3+ Accounts)

```
┌─────────────────────────────────────────────────┐
│  🏢 Asset Organizer                             │
│                                                 │
│  [📦 Client A ▼]  (interactive dropdown)        │
│     ├─ ✓ Client A (Owner)                       │
│     ├─ Client B (Admin)                         │
│     └─ Client C (Admin)                         │
└─────────────────────────────────────────────────┘

Settings > Accounts:
┌─────────────────────────────────────────────────┐
│  Your Clients                                   │
│  Manage your clients, edit details...           │
│                                                 │
│  Create New Client                              │
│  [Client name (e.g., Acme Corp)]  [Create]      │
└─────────────────────────────────────────────────┘
```

## When Does the UI Switch?

```
1 account  →  Simple mode (Regular User)
   ↓
Create 2nd account
   ↓
2+ accounts  →  Full mode (Agency User)
```

**Automatic** - No configuration needed!

## Terminology Mapping

| Context | Regular User | Agency User |
|---------|--------------|-------------|
| Single entity | Organization | Client |
| Multiple entities | Organizations | Clients |
| Page title | Your Organizations | Your Clients |
| Create action | Create Organization | Add Client |
| Settings | Account Settings | Manage Clients |

## Implementation Checklist

When building new features that reference accounts:

- [ ] Import user utilities: `import { getUserMode, getAccountTerminology } from "@/lib/user-utils"`
- [ ] Detect user mode: `const userMode = getUserMode(accounts)`
- [ ] Get terminology: `const terminology = getAccountTerminology(userMode)`
- [ ] Use dynamic terminology: `{terminology.account}` instead of hardcoded "Account"
- [ ] Test with both 1 account and 2+ accounts

## Common Patterns

### Basic Usage

```typescript
import { useAccount } from "@/lib/account-context";
import { getUserMode, getAccountTerminology } from "@/lib/user-utils";

function MyComponent() {
  const { accounts } = useAccount();
  const userMode = getUserMode(accounts);
  const terminology = getAccountTerminology(userMode);
  
  return <h1>Your {terminology.accounts}</h1>;
}
```

### Conditional Rendering

```typescript
const { accounts } = useAccount();
const isAgency = isAgencyUser(accounts);

{isAgency ? (
  <ClientManagementDashboard />
) : (
  <SimpleAssetUpload />
)}
```

### Account Switcher

```typescript
// Navigation (adaptive)
<AccountSwitcher />

// Settings (always full)
<AccountSwitcher forceFullMode={true} />
```

## Testing Shortcuts

### Create Agency User Quickly

```bash
# 1. Sign up
# 2. Go to Settings > Accounts
# 3. Create 2 more accounts
# 4. UI switches to agency mode automatically
```

### Test Data Isolation

```bash
# 1. Upload asset in Account A
# 2. Switch to Account B
# 3. Verify asset NOT visible in B
# 4. Upload different asset in B
# 5. Switch back to A
# 6. Verify only A's asset visible
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/user-utils.ts` | User mode detection utilities |
| `components/AccountSwitcher.tsx` | Adaptive account switcher |
| `app/settings/accounts/page.tsx` | Account management page |
| `components/accounts/CreateAccountForm.tsx` | Create account form |

## API Routes

All API routes already support multi-account:

- `GET /api/accounts` - List user's accounts
- `POST /api/accounts` - Create new account
- `GET /api/accounts/current` - Get active account
- `POST /api/accounts/switch` - Switch to different account

All asset/data routes filter by `accountId` automatically.

## Common Questions

**Q: Can a regular user become an agency user?**  
A: Yes, automatically when they create a 2nd account.

**Q: Can I force someone to be an agency user?**  
A: No need - it's automatic based on account count.

**Q: What if a user deletes accounts and goes back to 1?**  
A: UI automatically switches back to simple mode.

**Q: Can I hide the account switcher for agency users?**  
A: Not recommended, but possible with custom logic.

**Q: Is there a way to disable agency features?**  
A: Don't create multiple accounts. Regular users can't access agency features.

## Troubleshooting

### Account switcher not showing for multi-account user

**Check:**
1. Are there really 2+ accounts? `console.log(accounts.length)`
2. Is `useAccount()` being called correctly?
3. Is `AccountSwitcher` imported and rendered?

### Terminology not updating

**Check:**
1. Are you using `getAccountTerminology(userMode)`?
2. Is `userMode` being recalculated on account change?
3. Did you hardcode "Account" somewhere instead of using `terminology.account`?

### Simple mode showing when it shouldn't

**Check:**
1. Account count: `getAccountSwitcherMode(accounts)`
2. In settings? Use `forceFullMode={true}` prop
3. Accounts loading correctly? Check network tab

## Future Enhancements

See `AGENCY_VS_REGULAR_USERS.md` for full roadmap:

- [ ] User type field in database (optional)
- [ ] Agency-specific analytics dashboard
- [ ] Cross-client template sharing
- [ ] Subscription-based account limits
- [ ] Enhanced invitation workflow
- [ ] SSO for enterprise agencies

---

**Quick Start:** Import utilities → Detect mode → Use terminology → Test with 1 and 2+ accounts ✅
