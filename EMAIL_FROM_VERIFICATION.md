# EMAIL_FROM Configuration Verification

## All Email Sending Locations

All email sending in the app now **consistently uses `EMAIL_FROM`** from the environment variable:

### ✅ Files Using EMAIL_FROM

All files read `EMAIL_FROM` directly from `process.env.EMAIL_FROM` with **no hardcoded fallback**.

1. **`lib/auth.ts`** (NextAuth email provider)
   - Line 10: `const EMAIL_FROM = process.env.EMAIL_FROM;` (no fallback)
   - Validates `EMAIL_FROM` is set before sending
   - Uses `EMAIL_FROM` in EmailProvider config and sendVerificationRequest

2. **`app/api/auth/send-verification/route.ts`** (Custom verification endpoint)
   - Line 9: `const EMAIL_FROM = process.env.EMAIL_FROM;` (no fallback)
   - Returns error 500 if `EMAIL_FROM` is not set
   - Uses `EMAIL_FROM` for all email sending

3. **`app/api/test-email/route.ts`** (Email testing endpoint)
   - Line 6: `const EMAIL_FROM = process.env.EMAIL_FROM;` (no fallback)
   - Returns error 500 if `EMAIL_FROM` is not set
   - Uses `EMAIL_FROM` for test emails

4. **`app/api/accounts/[id]/invitations/route.ts`** (Account invitations)
   - Line 11: `const EMAIL_FROM = process.env.EMAIL_FROM;` (no fallback)
   - Returns error 500 if `EMAIL_FROM` is not set
   - Uses `EMAIL_FROM` for invitation emails

---

## Configuration

### Environment Variable

Set in `.env.local` (local) or your deployment environment:

```env
EMAIL_FROM=your-verified-email@yourdomain.com
```

**Important**: The email address must be:
- Verified in SendGrid (Single Sender Verification or Domain Authentication)
- Match the verified sender identity in SendGrid Dashboard

### Required Environment Variable

**`EMAIL_FROM` is REQUIRED** - there is no hardcoded fallback.

If `EMAIL_FROM` is not set:
- ✅ All email sending will fail with a clear error message
- ✅ Error responses will indicate `EMAIL_FROM` is missing
- ✅ `/api/auth/config` will show `❌ Not set (required)`

**You must set `EMAIL_FROM` to a verified sender address in SendGrid.**

---

## Verification

### Check Current Configuration

Visit: `http://localhost:3000/api/auth/config`

Look for:
```json
{
  "sendGrid": {
    "from": "your-email@yourdomain.com"  // Should match your EMAIL_FROM
  }
}
```

### Test Email Sending

Visit: `http://localhost:3000/api/test-email?email=test@example.com`

Check the `from` field in the response - it should match your `EMAIL_FROM` value.

---

## All Email Types

1. **Sign-in verification emails** → Uses `EMAIL_FROM`
2. **Account invitation emails** → Uses `EMAIL_FROM`
3. **Test emails** → Uses `EMAIL_FROM`

**All emails are now consistently sent from the `EMAIL_FROM` environment variable.**
