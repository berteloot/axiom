# Account Creation - Infrastructure Considerations

This document outlines the infrastructure considerations when creating new accounts in the Asset Organizer application.

## Overview

When a new account is created, the system handles:

1. **Database Setup**: Creates account record, user-account relationship, and session
2. **S3 Organization**: Files are organized by account ID for better isolation
3. **Permissions**: Verifies database permissions before creation
4. **Cleanup**: Handles S3 file cleanup when accounts are deleted

## Database Considerations

### Required Tables

The following tables must exist and be accessible:

- `users` - User records
- `accounts` - Account/company records
- `user_accounts` - Many-to-many relationship with roles
- `sessions` - Current account selection per user
- `assets` - Asset records (linked to accounts)
- `collections` - Collection records (linked to accounts)
- `company_profiles` - Company profile records (linked to accounts)

### Database Permissions

The database user must have the following permissions:

- `SELECT`, `INSERT`, `UPDATE`, `DELETE` on all account-related tables
- `USAGE` on the `public` schema
- Access to sequences for auto-increment IDs

**To verify permissions:**
```bash
npm run db:verify-permissions
```

**To grant permissions (as database admin):**
```bash
# Option 1: Run the SQL script
psql $DATABASE_URL -f scripts/grant-db-permissions.sql

# Option 2: Use the shell script
./scripts/grant-db-permissions.sh
```

See `scripts/grant-db-permissions.sql` for the complete SQL commands.

### Foreign Key Constraints

All foreign key constraints are set up with `ON DELETE CASCADE` to ensure proper cleanup:

- `user_accounts.userId` → `users.id` (CASCADE)
- `user_accounts.accountId` → `accounts.id` (CASCADE)
- `sessions.userId` → `users.id` (CASCADE)
- `sessions.accountId` → `accounts.id` (CASCADE)
- `assets.accountId` → `accounts.id` (CASCADE)
- `collections.accountId` → `accounts.id` (CASCADE)
- `company_profiles.accountId` → `accounts.id` (CASCADE)

## S3 Storage Considerations

### File Organization

Files are organized by account ID for better isolation and cleanup:

**Structure:**
```
accounts/{accountId}/uploads/{uuid}.{ext}
```

**Example:**
```
accounts/cmjvnk8aj00003oox0909l3qe/uploads/550e8400-e29b-41d4-a716-446655440000.pdf
```

### Benefits

1. **Account Isolation**: Files are clearly separated by account
2. **Easier Cleanup**: Can bulk delete all files for an account
3. **Access Control**: Can implement account-specific S3 policies
4. **Organization**: Better structure for managing large numbers of files

### S3 Permissions

The AWS credentials must have:

- `s3:PutObject` - To upload files
- `s3:GetObject` - To download/view files
- `s3:DeleteObject` - To delete files
- `s3:ListBucket` - To list files (for bulk operations)

**IAM Policy Example:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name/*",
        "arn:aws:s3:::your-bucket-name"
      ]
    }
  ]
}
```

### S3 Cleanup on Account Deletion

When an account is deleted:

1. Database cascade deletes all related records (assets, collections, etc.)
2. Individual asset deletion triggers S3 file deletion
3. Files are automatically cleaned up as assets are deleted

**Note**: For bulk S3 cleanup, you can implement a cleanup function that:
- Lists all objects with prefix `accounts/{accountId}/`
- Deletes them in batches
- See `lib/services/account-service.ts` for the placeholder function

## Account Creation Flow

1. **Validation**: Verify user ID and account name
2. **Database Check**: Verify database connection and permissions
3. **Slug Generation**: Create URL-friendly slug from account name
4. **Transaction**: Create account, user-account relationship, and session atomically
5. **User Creation**: Create user if it doesn't exist
6. **Response**: Return created account details

## Error Handling

The system handles various error scenarios:

- **Database Permission Errors**: Returns helpful error message with instructions
- **Unique Constraint Violations**: Handles duplicate slugs/emails gracefully
- **Foreign Key Constraint Errors**: Provides detailed error information
- **Connection Errors**: Detects and reports database connection issues

## Testing

To test account creation:

```bash
# Verify database permissions
npm run db:verify-permissions

# Test account creation (see scripts/test-account-creation.ts)
npx tsx scripts/test-account-creation.ts
```

## Troubleshooting

### "Database permissions insufficient"

**Solution**: Grant permissions to your database user:
```bash
npm run db:verify-permissions  # Check current permissions
./scripts/grant-db-permissions.sh  # Grant permissions
```

### "Foreign key constraint failed"

**Solution**: Ensure all related tables exist and have proper foreign key constraints:
```bash
npm run db:push  # Sync schema
```

### "S3 upload fails"

**Solution**: Check AWS credentials and S3 bucket permissions:
```bash
npm run test:s3  # Test S3 connection
```

## Common Issues

### PDF Upload Failures

If PDFs uploaded to an account fail with ERROR status:
- This is typically a webpack bundling issue with `pdf-parse`
- See `PDF_ERROR_FIX.md` for detailed troubleshooting
- Quick fix: Restart dev server and click "Retry" on failed assets

### Assets Not Isolated by Account

If you see assets from other accounts:
- Verify all API queries include `accountId` filter
- Check that `requireAccountId()` is being used
- Ensure session is correctly set to the active account

---

## Related Files

- `lib/services/account-service.ts` - Account creation service
- `app/api/accounts/route.ts` - Account API endpoint
- `app/api/upload/presigned/route.ts` - File upload (uses account-specific paths)
- `scripts/verify-db-permissions.ts` - Permission verification script
- `scripts/grant-db-permissions.sql` - Permission grant SQL
- `PDF_ERROR_FIX.md` - PDF processing troubleshooting

---

**Last Updated**: January 1, 2026
