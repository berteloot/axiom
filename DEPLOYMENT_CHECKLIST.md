# Deployment Checklist

Quick checklist for deploying Asset Organizer to GitHub and Render.

## Pre-Deployment

### GitHub Setup
- [ ] Repository created on GitHub
- [ ] Code pushed to GitHub
- [ ] `.env` file is NOT committed (check `.gitignore`)
- [ ] `.env.example` includes all required variables

### Credentials Prepared
- [ ] AWS S3 bucket created
- [ ] AWS IAM user created with S3 access
- [ ] AWS Access Key ID and Secret Access Key saved
- [ ] OpenAI API key ready
- [ ] SendGrid API key ready
- [ ] SendGrid sender email verified
- [ ] Jina AI API key ready (optional)
- [ ] NextAuth secret generated: `openssl rand -base64 32`

## Render Setup

### Database
- [ ] PostgreSQL database created on Render
- [ ] Database connection string copied
- [ ] Database migrations tested locally
- [ ] Database URL added to Render environment variables

### Web Service
- [ ] Web service created on Render
- [ ] GitHub repository connected
- [ ] Build command: `npm install && npx prisma generate && npm run build`
- [ ] Start command: `npm start`
- [ ] All environment variables set:
  - [ ] `DATABASE_URL`
  - [ ] `NODE_ENV=production`
  - [ ] `NEXTAUTH_URL` (your Render app URL)
  - [ ] `NEXTAUTH_SECRET`
  - [ ] `AWS_REGION`
  - [ ] `AWS_ACCESS_KEY_ID`
  - [ ] `AWS_SECRET_ACCESS_KEY`
  - [ ] `AWS_S3_BUCKET_NAME`
  - [ ] `OPENAI_API_KEY`
  - [ ] `SENDGRID_API_KEY`
  - [ ] `EMAIL_FROM`
  - [ ] `JINA_API_KEY` (optional)
  - [ ] `DATAFORSEO_LOGIN` (optional)
  - [ ] `DATAFORSEO_PASSWORD` (optional)

### Deployment
- [ ] First deployment completed successfully
- [ ] Database migrations run: `npx prisma migrate deploy` (in Render Shell)
- [ ] Application status is "Live"
- [ ] Health check passing

## Post-Deployment Verification

### Functionality Tests
- [ ] Application loads at production URL
- [ ] User registration works
- [ ] Email verification emails received
- [ ] Login works
- [ ] File upload to S3 works
- [ ] AI analysis works (check OpenAI usage)
- [ ] Database operations work
- [ ] Website scanning works (if JINA_API_KEY set)

### Monitoring
- [ ] Render logs checked (no errors)
- [ ] SendGrid dashboard shows email deliveries
- [ ] AWS S3 bucket shows uploaded files
- [ ] Database connections stable
- [ ] Memory/CPU usage normal

### Security
- [ ] All environment variables set (no defaults in code)
- [ ] `NEXTAUTH_SECRET` is strong and unique
- [ ] `NEXTAUTH_URL` matches production domain
- [ ] No sensitive data in GitHub repository
- [ ] AWS credentials have minimal permissions
- [ ] SSL/HTTPS enabled (automatic on Render)

## Optional Enhancements

- [ ] Custom domain configured
- [ ] Database backups enabled
- [ ] Monitoring alerts configured
- [ ] Error tracking set up (e.g., Sentry)
- [ ] Performance monitoring set up
- [ ] CDN configured (if needed)

---

**Quick Commands:**

```bash
# Generate NextAuth secret
openssl rand -base64 32

# Run database migrations (in Render Shell)
npx prisma migrate deploy

# Check service status
# (Check Render dashboard)

# View logs
# (Check Render dashboard → Logs tab)
```

---

See `DEPLOYMENT.md` for detailed instructions.
