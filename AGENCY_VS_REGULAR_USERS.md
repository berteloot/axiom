# Agency vs Regular User Architecture

## Overview

The Asset Organizer system accommodates two distinct user types:

### 1. **Regular Users** (Single Organization)
- Individual users or small teams managing their own assets
- Belong to **one organization** (their own company)
- Simplified experience with minimal account switching
- Focus on content management, not organization management

### 2. **Agency Users** (Multiple Organizations)
- Marketing agencies, consultancies, or service providers
- Manage **multiple client organizations**
- Need to switch between clients frequently
- Require organization management capabilities

## Current Architecture

### Database Schema

The system uses a **many-to-many relationship** between Users and Accounts (Organizations):

```prisma
User ←→ UserAccount ←→ Account
       (with role)
```

**Key Models:**

- **User**: Individual user account (email, authentication)
- **Account**: Organization/Company (represents a client or company)
- **UserAccount**: Junction table with user role (OWNER, ADMIN, MEMBER)
- **Session**: Tracks currently selected account per user

**Roles:**
- `OWNER`: Full control, can delete account, manage billing
- `ADMIN`: Can manage users, settings, and assets
- `MEMBER`: Can create and manage assets only

### How It Works

1. **User Sign-up**: Creates a user + default organization (becomes OWNER)
2. **Agency Workflow**: Agency invites existing/new users to their client organizations
3. **Account Switching**: Users with multiple accounts can switch between them
4. **Data Isolation**: All assets/data are scoped to the current account

## User Experience Considerations

### Regular Users
- **Auto-selection**: If user has only 1 account, it's automatically selected
- **Hidden switcher**: Account switcher can be simplified/hidden for single-account users
- **Simple onboarding**: Focus on asset upload and management
- **No account management**: Limited need to manage multiple organizations

### Agency Users
- **Account switcher**: Prominent in navigation for quick switching
- **Organization management**: Create accounts for each client
- **Invitation system**: Invite client users to their respective accounts
- **Role-based access**: Assign appropriate roles to agency staff and clients

## Current Implementation Status

✅ **Implemented:**
- Multi-account database schema
- User-Account many-to-many relationships
- Account switching functionality
- Role-based access control (OWNER, ADMIN, MEMBER)
- Session-based current account tracking
- Account creation and management
- Account managers (contact information)

⏳ **Partially Implemented:**
- Invitation system (schema exists, needs UI/email workflow)
- Account switcher shows for all users (could be conditional)

❌ **Not Yet Implemented:**
- User type detection (agency vs regular)
- Conditional UI based on account count
- Email invitation workflow for agencies
- Agency-specific dashboard/analytics
- Client access restrictions

## Recommended Enhancements

### 1. **Smart UI Adaptation**

**Goal**: Automatically adapt UI based on user's account count

```typescript
// In AccountContext or Navigation
const isAgencyUser = accounts.length > 1;
const shouldShowAccountSwitcher = isAgencyUser;
```

**Implementation:**
- Hide account switcher for single-account users
- Show "Manage Clients" instead of "Manage Accounts" for agencies
- Simplified navigation for regular users

### 2. **User Type Detection (Optional)**

Add optional `userType` field to User model:

```prisma
model User {
  // ... existing fields
  userType  UserType  @default(REGULAR)
}

enum UserType {
  REGULAR  // Single organization user
  AGENCY   // Multi-organization manager
}
```

**Benefits:**
- Explicit user type for analytics
- Can enable agency-specific features proactively
- Better onboarding experience

**Alternative**: Use dynamic detection based on account count (simpler)

### 3. **Enhanced Invitation System**

**For Agencies:**
- Invite users to specific client accounts
- Set roles per invitation (ADMIN, MEMBER)
- Email template: "You've been invited to [Client Name] by [Agency Name]"

**For Regular Users:**
- Invite team members to their organization
- Simpler workflow focused on collaboration

**Implementation Priority:**
1. ✅ Database schema (already exists)
2. ⚠️ API routes for invitations
3. ⚠️ Email sending (SendGrid configured)
4. ⚠️ UI for sending/accepting invites
5. ⚠️ Invitation expiry and management

### 4. **Account Creation Restrictions**

**Decision Point**: Should regular users be able to create multiple accounts?

**Option A: Unrestricted** (Current)
- Any user can create unlimited accounts
- Becomes "agency user" automatically
- Simpler, more flexible

**Option B: Restricted**
- Require "agency" user type to create multiple accounts
- Regular users limited to 1 account
- More control, prevents confusion

**Recommendation**: Keep unrestricted for now, add limits based on subscription tier later

### 5. **Conditional Navigation**

```tsx
// In Navigation.tsx or AccountSwitcher.tsx
const { accounts } = useAccount();
const isMultiAccountUser = accounts.length > 1;

// Show switcher only if needed
{isMultiAccountUser && <AccountSwitcher />}

// Or show minimal version for single account
{accounts.length === 1 ? (
  <div className="text-sm text-muted-foreground">
    {currentAccount?.name}
  </div>
) : (
  <AccountSwitcher />
)}
```

## API Routes & Access Control

### Account Filtering
All API routes **must** filter by `accountId` to ensure data isolation:

```typescript
// ❌ BAD: Returns all assets across all accounts
const assets = await prisma.asset.findMany();

// ✅ GOOD: Returns only current account's assets
const accountId = await requireAccountId(request);
const assets = await prisma.asset.findMany({
  where: { accountId }
});
```

### Role-Based Authorization

```typescript
// Check if user is admin/owner
const canManageSettings = await isUserAdminOrOwner(request);
if (!canManageSettings) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### Account Access Verification

```typescript
// Verify user has access to the account
const accountId = await getCurrentAccountId(request);
const userId = await getUserId(request);

const userAccount = await prisma.userAccount.findUnique({
  where: {
    userId_accountId: { userId, accountId }
  }
});

if (!userAccount) {
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
```

## Use Case Examples

### Example 1: Marketing Agency

**Scenario**: "Digital Boost Agency" manages 5 clients

**Setup:**
1. Agency owner signs up → creates "Digital Boost" account (becomes OWNER)
2. Creates additional accounts for each client:
   - "Client A Corp" (agency owner is ADMIN)
   - "Client B LLC" (agency owner is ADMIN)
   - "Client C Inc" (agency owner is ADMIN)
3. Invites client users to their respective accounts (as MEMBER)
4. Invites agency team members to all accounts (as ADMIN)

**Daily Workflow:**
- Agency owner switches between client accounts via AccountSwitcher
- Uploads assets for each client in their respective account
- Clients only see their own account/assets
- Agency maintains ADMIN access to all client accounts

### Example 2: Regular Company

**Scenario**: "Acme Corp" manages their own marketing assets

**Setup:**
1. Marketing director signs up → creates "Acme Corp" account (becomes OWNER)
2. Invites marketing team members to "Acme Corp" (as ADMIN or MEMBER)
3. Single account for entire organization

**Daily Workflow:**
- All users automatically in "Acme Corp" context
- No account switching needed
- Focus entirely on asset management
- Collaboration within single organization

### Example 3: Hybrid Scenario

**Scenario**: User starts as regular, becomes agency

**Setup:**
1. User signs up → creates personal account "My Company"
2. Later, starts consulting → creates accounts for clients
3. Seamlessly transitions to multi-account mode

**Behavior:**
- System automatically adapts UI (shows AccountSwitcher)
- No migration needed, already supports it
- User becomes "agency user" organically

## Migration & Onboarding

### For Existing Users
- No migration needed, schema already supports both modes
- Users with 1 account = regular users
- Users with 2+ accounts = agency users
- UI adapts automatically

### For New Users

**Onboarding Questions:**
1. "What best describes you?"
   - [ ] Individual/Company managing own assets (→ Regular)
   - [ ] Agency/Consultant managing client assets (→ Agency)

2. Based on answer:
   - **Regular**: "Name your organization" → create 1 account
   - **Agency**: "Name your agency" → create agency account, guide to create client accounts

### Account Creation Guidance

**For Agencies:**
```
🏢 Create Client Accounts

You can create separate accounts for each client you manage. This ensures:
✓ Complete data isolation between clients
✓ Easy switching between client contexts  
✓ Granular access control per client

Create your first client account:
[Account Name] [Create Account]

You can invite clients and team members later.
```

**For Regular Users:**
```
🚀 Welcome to Asset Organizer

Your organization "{Company Name}" is ready!

Next steps:
✓ Upload your first asset
✓ Set up your brand profile
✓ Invite team members (optional)
```

## Security Considerations

### Data Isolation
- **Critical**: All queries must filter by `accountId`
- Use `requireAccountId()` utility in all API routes
- Validate user has access to the account before operations

### Role Verification
- Check user role before admin operations
- MEMBER role: Can only create/edit own assets
- ADMIN role: Can manage all account assets and settings
- OWNER role: Can delete account and manage billing

### Invitation Security
- Secure token generation for invites
- Expiry after 7 days (configurable)
- Verify email domain for corporate accounts (optional)
- Rate limit invitation sending

### API Security
```typescript
// Pattern for all protected routes
export async function GET(request: NextRequest) {
  // 1. Authenticate user
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get/verify account
  const accountId = await requireAccountId(request);
  
  // 3. Verify access
  const userAccount = await prisma.userAccount.findUnique({
    where: { userId_accountId: { userId, accountId } }
  });
  
  if (!userAccount) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Check role if needed
  if (requiresAdmin && !["OWNER", "ADMIN"].includes(userAccount.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5. Proceed with operation
  // ... filtered by accountId
}
```

## Testing Scenarios

### Test Case 1: Regular User Journey
1. Sign up with email
2. Verify only 1 account exists
3. Upload asset → should auto-associate with account
4. No account switcher visible (or simplified)
5. Invite team member → they join same account

### Test Case 2: Agency User Journey
1. Sign up as agency
2. Create 3 client accounts
3. Verify account switcher shows all accounts
4. Switch between accounts → verify data isolation
5. Upload asset in Account A → should NOT appear in Account B
6. Invite user to Account A → they should NOT see Account B/C

### Test Case 3: Access Control
1. User A creates account, invites User B as MEMBER
2. User B tries to delete account → should fail
3. User B tries to invite users → should fail (if restricted to ADMIN+)
4. User A promotes User B to ADMIN → User B can now manage
5. User B tries to access Account C (not invited) → should fail

### Test Case 4: Account Switching
1. Agency user with 5 accounts
2. Switch to Account A → verify assets filtered
3. Switch to Account B → verify different assets
4. Verify session persists on page reload
5. API calls use correct accountId after switch

## Future Enhancements

### Phase 1: Core Experience (Current)
- ✅ Multi-account support
- ✅ Account switching
- ✅ Role-based access
- ⚠️ Invitation system (in progress)

### Phase 2: UX Improvements
- [ ] Conditional UI based on account count
- [ ] Smart onboarding flow
- [ ] Invitation email workflow
- [ ] Account member management UI

### Phase 3: Agency Features
- [ ] Client dashboard (agency view of all clients)
- [ ] Cross-account analytics
- [ ] Template sharing across accounts
- [ ] Bulk operations across clients

### Phase 4: Enterprise Features
- [ ] SSO (Single Sign-On)
- [ ] SAML authentication
- [ ] Audit logs per account
- [ ] Advanced permissions (custom roles)
- [ ] Account hierarchies (sub-accounts)

## Best Practices

### For Developers

1. **Always filter by accountId**
   ```typescript
   // Get current account
   const accountId = await requireAccountId(request);
   
   // Filter all queries
   const data = await prisma.model.findMany({
     where: { accountId }
   });
   ```

2. **Verify user access before operations**
   ```typescript
   const hasAccess = await verifyUserAccountAccess(userId, accountId);
   if (!hasAccess) throw new Error("Access denied");
   ```

3. **Use role-based checks**
   ```typescript
   const role = await getCurrentUserRole(request);
   const canDelete = ["OWNER", "ADMIN"].includes(role);
   ```

4. **Handle account switching**
   ```typescript
   // After switching, reload page to refresh all data
   await switchAccount(newAccountId);
   window.location.reload();
   ```

### For Product/Design

1. **Progressive disclosure**
   - Start simple for single-account users
   - Reveal multi-account features only when needed

2. **Clear context indicators**
   - Always show which account user is in
   - Color-code or icon different account types

3. **Prevent accidental data mixing**
   - Confirm before switching with unsaved changes
   - Show account name in confirmation dialogs

4. **Optimize for common workflows**
   - Agency: Quick switching, client management
   - Regular: Asset focus, minimal account management

## Frequently Asked Questions

**Q: Can a regular user become an agency user?**  
A: Yes, automatically. When they create a 2nd account, they have multi-account capabilities.

**Q: Can agency users share assets between client accounts?**  
A: Not currently. Each account is isolated. Future feature: template library.

**Q: What happens if a user is invited to multiple accounts?**  
A: They become a multi-account user and can switch between them.

**Q: Can a user delete an account they don't own?**  
A: No, only OWNER role can delete accounts.

**Q: How are assets migrated between accounts?**  
A: Currently not supported. Future: export/import feature.

**Q: Can agencies white-label the platform for clients?**  
A: Not yet. Future enterprise feature.

**Q: What's the limit on accounts per user?**  
A: No limit currently. Future: based on subscription tier.

## Summary

The current architecture **already supports both regular and agency users** through the flexible many-to-many User-Account relationship. The main opportunities for improvement are:

1. **UX adaptation** - Simplify for single-account users
2. **Invitation workflow** - Complete the invitation system
3. **Role-based features** - More granular permissions
4. **Agency-specific tools** - Cross-client analytics, templates

The foundation is solid. Future enhancements will focus on optimizing the experience for each user type while maintaining architectural flexibility.

---

**Document Version**: 1.0  
**Last Updated**: January 1, 2026  
**Status**: Architecture documented, enhancements planned
