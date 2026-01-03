# Multi-Account Setup Guide

This application now supports multi-account (multi-company) functionality, allowing a single user to manage multiple accounts/companies.

## Architecture Overview

### Database Schema

The multi-account system uses the following models:

- **User**: Represents individual users
- **Account**: Represents companies/organizations
- **UserAccount**: Many-to-many relationship between users and accounts with roles (OWNER, ADMIN, MEMBER)
- **Session**: Tracks the currently selected account for each user
- **Asset, Collection, CompanyProfile**: All linked to accounts via `accountId`

### Key Features

1. **Account Isolation**: All assets, collections, and company profiles are scoped to accounts
2. **Account Switching**: Users can switch between accounts they have access to
3. **Role-Based Access**: Users can have different roles (OWNER, ADMIN, MEMBER) in different accounts
4. **Session Management**: The current account is tracked per user in the Session table

## Setup Instructions

### 1. Database Migration

Run the Prisma migration to update your database schema:

```bash
npm run db:push
# or
npx prisma migrate dev --name add_multi_account_support
```

### 2. Initialize First User and Account

Since authentication is not yet implemented, you'll need to manually create the first user and account. You can do this via:

**Option A: Using Prisma Studio**
```bash
npm run db:studio
```

Then manually create:
1. A User record (with email, name, etc.)
2. An Account record (with name, slug)
3. A UserAccount record linking them (with role: OWNER)
4. A Session record (userId -> accountId)

**Option B: Using a SQL script**

Create a script to initialize the first user and account:

```sql
-- Insert first user
INSERT INTO users (id, email, name, "createdAt", "updatedAt")
VALUES ('user-1', 'admin@example.com', 'Admin User', NOW(), NOW());

-- Insert first account
INSERT INTO accounts (id, name, slug, "createdAt", "updatedAt")
VALUES ('account-1', 'My Company', 'my-company', NOW(), NOW());

-- Link user to account as OWNER
INSERT INTO user_accounts (id, "userId", "accountId", role, "createdAt")
VALUES ('ua-1', 'user-1', 'account-1', 'OWNER', NOW());

-- Create session to set current account
INSERT INTO sessions (id, "userId", "accountId", "createdAt", "updatedAt")
VALUES ('session-1', 'user-1', 'account-1', NOW(), NOW());
```

**Option C: Using the API (after implementing auth)**

Once authentication is implemented, the first account will be created automatically when a user signs up.

### 3. Update API Routes (Authentication)

Currently, the API routes use a mock user ID from headers (`x-user-id`). You'll need to:

1. Implement proper authentication (e.g., NextAuth, Clerk, Auth0)
2. Update `lib/account-utils.ts` to extract the real user ID from the session
3. Remove the mock `getUserId` function

### 4. Frontend Usage

The frontend automatically:
- Loads the current account on app start
- Shows an account switcher in the navigation
- Filters all data by the current account
- Provides account management in Settings > Accounts

## API Routes

### Account Management

- `GET /api/accounts` - List all accounts for the current user
- `POST /api/accounts` - Create a new account
- `GET /api/accounts/current` - Get the currently selected account
- `POST /api/accounts/switch` - Switch to a different account

### Updated Routes

All existing routes now filter by `accountId`:
- `/api/assets` - Only returns assets for the current account
- `/api/company-profile` - Returns/updates profile for the current account
- All asset operations are scoped to the current account

## UI Components

### AccountSwitcher

Located in the navigation bar, allows users to:
- View current account
- Switch between accounts
- Create new accounts (quick action)

### Account Management Page

Located at `/settings/accounts`, provides:
- List of all user's accounts
- Create new account form
- Switch account functionality
- Account details (role, creation date)

## Best Practices

1. **Always filter by accountId**: All database queries should include `accountId` to ensure data isolation
2. **Use requireAccountId()**: Use the utility function to ensure an account is selected before operations
3. **Handle no account gracefully**: Show appropriate UI when no account is selected
4. **Account switching**: Automatically reloads the page to refresh all data with the new account context

## Common Issues & Solutions

### PDF Assets Failing After Account Creation

**Issue**: PDFs uploaded to newly created accounts show ERROR status  
**Solution**: See `PDF_ERROR_FIX.md` - This is a webpack/Next.js bundling issue with `pdf-parse`

**Quick Fix:**
1. Restart dev server: `npm run dev`
2. Go to Dashboard and click "Retry" on failed assets

### Account Switching Not Working

**Issue**: Assets still show from previous account after switching  
**Solution**: 
- Account switching triggers a page reload to refresh data
- Check browser console for errors
- Verify session is being updated in database

### Can't Create New Account

**Issue**: Account creation fails with database error  
**Solution**:
- Verify database permissions: `npm run db:verify-permissions`
- Ensure Prisma client is generated: `npm run db:generate`
- Check database connection in `.env` file

---

## Future Enhancements

- [ ] Invite users to accounts
- [ ] Account-level permissions and settings
- [ ] Account deletion and archival
- [ ] Account analytics and usage tracking
- [ ] Team collaboration features

---

**Last Updated**: January 1, 2026  
**Current Version**: Multi-account with PDF processing fix
