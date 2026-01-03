# Credential Rotation Guide

**⚠️ CRITICAL:** Your API credentials were exposed during a security audit and MUST be rotated immediately.

---

## 🔄 Step-by-Step Rotation Process

### 1. AWS Credentials (CRITICAL)

**Current Credentials to Revoke:**
- Access Key ID: `AKIA3FLDYL7Z57OGU674`

**Steps:**
1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Go to **IAM** → **Users** → Find your user
3. Go to **Security credentials** tab
4. Find the access key `AKIA3FLDYL7Z57OGU674`
5. Click **Delete** on this access key
6. Click **Create access key**
7. Select **Application running outside AWS**
8. Copy the new Access Key ID and Secret Access Key
9. Update your `.env` file:
   ```bash
   AWS_ACCESS_KEY_ID=your_new_access_key_id
   AWS_SECRET_ACCESS_KEY=your_new_secret_access_key
   ```

**Security Recommendations:**
- Enable MFA on your AWS account
- Set up billing alerts
- Review CloudTrail logs for any unauthorized access
- Consider using IAM roles instead of access keys for production

---

### 2. OpenAI API Key (CRITICAL)

**Current Key to Revoke:**
- Starts with: `sk-proj-JI1tXvux...`

**Steps:**
1. Log in to [OpenAI Dashboard](https://platform.openai.com/)
2. Go to **API keys** section
3. Find the key starting with `sk-proj-JI1tXvux`
4. Click **Delete** or **Revoke** on this key
5. Click **Create new secret key**
6. Give it a descriptive name (e.g., "Asset Organizer - Jan 2026")
7. Copy the new key (it will only be shown once!)
8. Update your `.env` file:
   ```bash
   OPENAI_API_KEY=sk-proj-your_new_api_key_here
   ```

**Security Recommendations:**
- Set usage limits in OpenAI dashboard
- Monitor API usage for anomalies
- Use separate keys for development and production

---

### 3. SendGrid API Key (CRITICAL)

**Current Key to Revoke:**
- Starts with: `SG.QrheYA1q...`

**Steps:**
1. Log in to [SendGrid Dashboard](https://app.sendgrid.com/)
2. Go to **Settings** → **API Keys**
3. Find the key starting with `SG.QrheYA1q`
4. Click **Delete** on this key
5. Click **Create API Key**
6. Select **Restricted Access** and choose:
   - Mail Send: **Full Access**
   - All others: **No Access** (unless needed)
7. Give it a descriptive name (e.g., "Asset Organizer - Jan 2026")
8. Copy the new API key
9. Update your `.env` file:
   ```bash
   SENDGRID_API_KEY=SG.your_new_sendgrid_api_key_here
   ```

**Security Recommendations:**
- Use restricted access with minimum required permissions
- Verify sender identity
- Monitor email sending patterns
- Set up authentication (SPF, DKIM, DMARC)

---

### 4. Database Password (IMPORTANT)

**Current Database:**
- Host: `dpg-d5ar9p2li9vc73bbjmo0-a.oregon-postgres.render.com`
- Database: `assetorg`
- Username: `assetorg_88g4_user`

**Steps:**
1. Log in to [Render Dashboard](https://dashboard.render.com/)
2. Go to your PostgreSQL database: `assetorg`
3. Click on the database
4. In the **Settings** tab, look for **Reset Password** or similar option
5. If password reset is not available:
   - Consider creating a new database user with a strong password
   - Or continue monitoring and rotate in the future
6. Copy the new connection string
7. Update your `.env` file:
   ```bash
   DATABASE_URL=postgresql://username:new_password@host:5432/database
   ```

**Security Recommendations:**
- Use strong, randomly generated passwords
- Restrict database access by IP if possible
- Enable SSL/TLS (already enabled)
- Regular backups
- Monitor for unusual query patterns

---

### 5. NextAuth Secret (REQUIRED)

**Generate New Secret:**
```bash
openssl rand -base64 32
```

**Steps:**
1. Open terminal
2. Run the command above
3. Copy the generated string
4. Update your `.env` file:
   ```bash
   NEXTAUTH_SECRET=your_newly_generated_secret_here
   ```

**Important:**
- This will invalidate all existing user sessions
- Users will need to log in again
- This is necessary for security

---

## ✅ After Rotation Checklist

Once you've rotated all credentials:

1. **Update .env file**
   ```bash
   # Verify your .env file has all new credentials
   cat .env | grep -E "AWS_ACCESS_KEY_ID|OPENAI_API_KEY|SENDGRID_API_KEY|DATABASE_URL|NEXTAUTH_SECRET"
   ```

2. **Restart your application**
   ```bash
   # Kill any running instances
   pkill -f "next dev"
   
   # Start fresh
   npm run dev
   ```

3. **Test functionality**
   - [ ] Can log in to the application
   - [ ] Can upload files to S3
   - [ ] Can process assets with AI
   - [ ] Can send email verification
   - [ ] Can access database

4. **Monitor for issues**
   - Check AWS CloudTrail for any failed authentication attempts
   - Check OpenAI usage dashboard
   - Check SendGrid activity
   - Review application logs

5. **Document new credentials**
   - Store in a secure password manager (1Password, Bitwarden, etc.)
   - Never commit to git
   - Share securely with team members if needed (use a secrets vault)

---

## 🔐 Prevention: Future Security Practices

### 1. Use a Secrets Manager
Consider using one of these for production:
- **AWS Secrets Manager** - Automatic rotation, integrated with AWS
- **Vercel Environment Variables** - If deploying to Vercel
- **HashiCorp Vault** - For advanced secrets management
- **1Password** / **Bitwarden** - For team credential sharing

### 2. Separate Development and Production
```bash
# .env.local (development - not committed)
DATABASE_URL=postgresql://localhost:5432/assetorg_dev
AWS_ACCESS_KEY_ID=dev_key
...

# .env.production (production - stored in secrets manager)
DATABASE_URL=postgresql://prod-host/assetorg_prod
AWS_ACCESS_KEY_ID=prod_key
...
```

### 3. Regular Rotation Schedule
- **AWS Keys:** Every 90 days
- **API Keys:** Every 6 months
- **Database Passwords:** Every 6 months
- **NextAuth Secret:** Every year (causes user logouts)

### 4. Monitoring
- Set up AWS CloudWatch alarms
- Monitor API usage dashboards
- Set up billing alerts
- Review access logs weekly

### 5. Git Repository Setup
```bash
# Initialize git (if not done)
git init

# Verify .env is ignored
git status  # Should NOT show .env file

# If .env appears, add to .gitignore immediately
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Add .gitignore"
```

---

## 📞 Need Help?

If you encounter issues during rotation:

1. **AWS Issues:**
   - AWS Support: https://console.aws.amazon.com/support/
   - Documentation: https://docs.aws.amazon.com/IAM/

2. **OpenAI Issues:**
   - Help Center: https://help.openai.com/
   - Status Page: https://status.openai.com/

3. **SendGrid Issues:**
   - Support: https://support.sendgrid.com/
   - Documentation: https://docs.sendgrid.com/

4. **Render Issues:**
   - Support: https://render.com/docs/support
   - Status Page: https://status.render.com/

---

## ⏱️ Estimated Time to Complete

- **AWS:** 5-10 minutes
- **OpenAI:** 2-3 minutes
- **SendGrid:** 3-5 minutes
- **Database:** 5-10 minutes (if supported)
- **NextAuth:** 1 minute
- **Testing:** 10-15 minutes

**Total:** ~30-45 minutes

---

**Start Now:** Begin with AWS credentials (highest risk), then proceed in order.

**Last Updated:** January 1, 2026
