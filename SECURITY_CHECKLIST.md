# Security Checklist - Asset Organizer

**Quick Reference:** Use this checklist to ensure your application is secure.

---

## 🚨 IMMEDIATE ACTIONS (Do Now)

- [ ] **Rotate AWS Credentials**
  - Delete key: `AKIA3FLDYL7Z57OGU674`
  - Create new access key
  - Update `.env` file
  - Test S3 upload functionality

- [ ] **Rotate OpenAI API Key**
  - Revoke key starting with `sk-proj-JI1tXvux`
  - Create new API key
  - Update `.env` file
  - Test AI analysis functionality

- [ ] **Rotate SendGrid API Key**
  - Delete key starting with `SG.QrheYA1q`
  - Create new API key
  - Update `.env` file
  - Test email sending

- [ ] **Reset Database Password** (if possible)
  - Log in to Render dashboard
  - Reset password for database
  - Update `DATABASE_URL` in `.env`
  - Test database connection

- [ ] **Generate New NextAuth Secret**
  ```bash
  openssl rand -base64 32
  ```
  - Update `NEXTAUTH_SECRET` in `.env`
  - Restart application

- [ ] **Restart Application**
  ```bash
  pkill -f "next dev"
  npm run dev
  ```

- [ ] **Test All Functionality**
  - Login/authentication works
  - File uploads work
  - AI processing works
  - Email sending works
  - Database operations work

---

## ✅ ENVIRONMENT VARIABLES

### Verify Configuration
```bash
# Check that .env is NOT tracked by git
git status | grep .env
# Should return nothing if .env is properly ignored

# Verify .env.example exists
ls -la .env.example

# Verify no sensitive data in source code
grep -r "sk-proj-\|AKIA\|SG\.\|postgresql://.*:.*@" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next
# Should return nothing
```

### Required Variables
- [x] `DATABASE_URL` - PostgreSQL connection string
- [x] `AWS_REGION` - AWS region (e.g., us-east-1)
- [x] `AWS_ACCESS_KEY_ID` - AWS access key
- [x] `AWS_SECRET_ACCESS_KEY` - AWS secret key
- [x] `AWS_S3_BUCKET_NAME` - S3 bucket name
- [x] `OPENAI_API_KEY` - OpenAI API key
- [x] `SENDGRID_API_KEY` - SendGrid API key
- [x] `EMAIL_FROM` - Email sender address
- [x] `NEXTAUTH_SECRET` - NextAuth secret
- [x] `NEXTAUTH_URL` - Application URL

### Security Rules
- [x] No `NEXT_PUBLIC_` prefix on sensitive variables
- [x] `.env` file in `.gitignore`
- [x] `.env.example` file with placeholders
- [x] No credentials in source code
- [x] No credentials in comments

---

## 🔒 CODE SECURITY

### Server-Side Only
- [x] `lib/prisma.ts` only imported by API routes
- [x] `lib/s3.ts` only imported by API routes (except safe utilities)
- [x] `lib/ai.ts` only imported by API routes (except types)
- [x] `lib/text-extraction.ts` only imported by server code
- [x] `lib/auth.ts` only imported by server code

### Client-Side Safety
- [x] No client components import sensitive libraries
- [x] No `process.env` access in client components
- [x] Only type imports from sensitive libraries
- [x] All sensitive operations via API routes

### API Route Security
- [x] Authentication checks on protected routes
- [x] Rate limiting implemented
- [x] Input validation (Zod schemas)
- [x] Error handling (no sensitive info in errors)
- [x] CORS properly configured

---

## 🛡️ AWS SECURITY

### IAM Configuration
- [ ] MFA enabled on AWS account
- [ ] IAM user has minimum required permissions
- [ ] Access keys rotated regularly (every 90 days)
- [ ] CloudTrail logging enabled
- [ ] CloudWatch alarms configured

### S3 Security
- [x] Bucket not publicly accessible
- [x] CORS properly configured
- [x] Presigned URLs used (temporary access)
- [ ] Lifecycle policies configured
- [ ] Versioning enabled (recommended)
- [ ] Encryption at rest enabled (recommended)

### Monitoring
- [ ] AWS CloudWatch alarms set up
- [ ] Billing alerts configured
- [ ] Unusual activity alerts
- [ ] Regular CloudTrail review

---

## 🗄️ DATABASE SECURITY

### Connection
- [x] SSL/TLS enabled
- [x] Connection string in `.env` only
- [x] No database credentials in source code
- [ ] IP whitelist configured (if supported)

### Access Control
- [x] Database user has minimum required permissions
- [ ] Regular password rotation (every 6 months)
- [ ] Separate users for dev/prod
- [ ] Connection pooling configured

### Backup & Recovery
- [ ] Automated backups enabled
- [ ] Backup retention policy defined
- [ ] Recovery process tested
- [ ] Point-in-time recovery available

---

## 🔑 API KEY MANAGEMENT

### OpenAI
- [x] API key in `.env` only
- [ ] Usage limits configured
- [ ] Billing alerts set up
- [ ] Separate keys for dev/prod
- [ ] Regular usage monitoring

### SendGrid
- [x] API key in `.env` only
- [x] Restricted access permissions
- [ ] Sender identity verified
- [ ] SPF/DKIM/DMARC configured
- [ ] Email sending patterns monitored

### General
- [ ] All keys stored in password manager
- [ ] Keys shared securely (never via email/chat)
- [ ] Regular rotation schedule
- [ ] Keys never logged or printed

---

## 🚀 DEPLOYMENT SECURITY

### Production Environment
- [ ] Separate `.env.production` file
- [ ] Secrets stored in secure vault
- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] Rate limiting in place

### CI/CD Security
- [ ] Secrets not in CI/CD logs
- [ ] Environment variables in CI/CD platform
- [ ] Automated security scanning
- [ ] Dependency vulnerability checks

---

## 📊 MONITORING & AUDITING

### Regular Tasks
- [ ] Weekly: Review access logs
- [ ] Weekly: Check for failed login attempts
- [ ] Weekly: Monitor API usage
- [ ] Monthly: Review AWS CloudTrail
- [ ] Monthly: Security audit
- [ ] Quarterly: Rotate credentials
- [ ] Quarterly: Update dependencies

### Alerts
- [ ] Failed authentication attempts
- [ ] Unusual API usage patterns
- [ ] High S3 storage usage
- [ ] High database connections
- [ ] Billing thresholds exceeded

---

## 🔧 DEPENDENCIES

### Package Security
```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

### Regular Maintenance
- [ ] Run `npm audit` weekly
- [ ] Update dependencies monthly
- [ ] Review security advisories
- [ ] Test after updates

---

## 📝 DOCUMENTATION

### Required Documentation
- [x] `.env.example` with all required variables
- [x] `SECURITY.md` with security practices
- [x] `SECURITY_AUDIT_REPORT.md` with findings
- [x] `CREDENTIAL_ROTATION_GUIDE.md` with instructions
- [ ] Deployment guide with security considerations
- [ ] Incident response plan

### Team Knowledge
- [ ] All team members understand security practices
- [ ] Credential rotation procedures documented
- [ ] Incident response plan reviewed
- [ ] Security training completed

---

## 🎯 QUICK SECURITY CHECK

Run this command to perform a quick security check:

```bash
cd "/Users/stanislasberteloot/Projects/Nytro-Apps/Asset Organizer"

echo "🔍 Security Check..."

# Check .env is ignored
echo "\n1. Checking .gitignore..."
grep -q "^\.env$" .gitignore && echo "✅ .env is in .gitignore" || echo "❌ .env is NOT in .gitignore"

# Check .env.example exists
echo "\n2. Checking .env.example..."
[ -f .env.example ] && echo "✅ .env.example exists" || echo "❌ .env.example does not exist"

# Check for sensitive data in source
echo "\n3. Checking for hardcoded credentials..."
CREDS=$(grep -r "sk-proj-\|AKIA\|SG\.\|postgresql://.*:.*@" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . 2>/dev/null | grep -v node_modules | grep -v .next | grep -v .env)
if [ -z "$CREDS" ]; then
    echo "✅ No hardcoded credentials found"
else
    echo "❌ Potential credentials found in source code:"
    echo "$CREDS"
fi

# Check for NEXT_PUBLIC_ usage
echo "\n4. Checking for NEXT_PUBLIC_ usage..."
PUBLIC_VARS=$(grep -r "NEXT_PUBLIC_" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . 2>/dev/null | grep -v node_modules | grep -v .next)
if [ -z "$PUBLIC_VARS" ]; then
    echo "✅ No NEXT_PUBLIC_ variables in source code"
else
    echo "⚠️  NEXT_PUBLIC_ variables found (verify they're not sensitive):"
    echo "$PUBLIC_VARS"
fi

echo "\n✅ Security check complete!"
```

---

## 📞 RESOURCES

### Documentation
- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [OpenAI API Safety](https://platform.openai.com/docs/guides/safety-best-practices)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

### Tools
- [AWS IAM Access Analyzer](https://aws.amazon.com/iam/features/analyze-access/)
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [git-secrets](https://github.com/awslabs/git-secrets)
- [Snyk](https://snyk.io/)

---

**Last Updated:** January 1, 2026  
**Next Review:** February 1, 2026
