# Render Deployment Checklist

This checklist ensures your application deploys successfully on Render.

## Pre-Deployment

### 1. Code Preparation
- [ ] All code committed and pushed to GitHub
- [ ] `.env` file is **NOT** committed (checked in `.gitignore`)
- [ ] `.env.example` includes all required and optional variables
- [ ] No hardcoded credentials or API keys in code
- [ ] All TypeScript errors resolved (or `ignoreBuildErrors: true` in `next.config.js`)

### 2. Database Setup
- [ ] PostgreSQL database created on Render (via `render.yaml` or manually)
- [ ] Database connection string available
- [ ] Prisma schema is up to date
- [ ] Migration files exist in `prisma/migrations/` directory

### 3. Environment Variables Checklist

**Required Variables:**
- [ ] `DATABASE_URL` - Auto-populated if database is linked
- [ ] `NODE_ENV=production`
- [ ] `NEXTAUTH_URL` - Your Render app URL (e.g., `https://your-app.onrender.com`)
- [ ] `NEXTAUTH_SECRET` - Generate with: `openssl rand -base64 32`
- [ ] `AWS_REGION` - Your S3 region (e.g., `us-east-1`)
- [ ] `AWS_ACCESS_KEY_ID` - From AWS IAM
- [ ] `AWS_SECRET_ACCESS_KEY` - From AWS IAM
- [ ] `AWS_S3_BUCKET_NAME` - Your S3 bucket name
- [ ] `OPENAI_API_KEY` - From OpenAI dashboard
- [ ] `SENDGRID_API_KEY` - From SendGrid dashboard
- [ ] `EMAIL_FROM` - Verified sender email

**Optional Variables (app works without these, but features disabled):**
- [ ] `OPENAI_WEB_SEARCH_MODEL` - Model for brand research web search (defaults to gpt-5, set to gpt-4o if you don't have gpt-5 access)
- [ ] `JINA_API_KEY` - For trending topics discovery (optional)
- [ ] `DATAFORSEO_LOGIN` - For keyword research (optional)
- [ ] `DATAFORSEO_PASSWORD` - For keyword research (optional)

## Render Configuration (`render.yaml`)

### 4. Service Configuration
- [ ] Database service configured correctly
- [ ] Web service build command: `npm ci && npx prisma generate && npm run build`
- [ ] Web service start command: `npm start`
- [ ] Health check path: `/`
- [ ] Region matches for database and web service
- [ ] Plan selected (starter recommended for initial deployment)

### 5. Environment Variables in `render.yaml`
- [ ] All required variables listed with `sync: false` (set manually)
- [ ] `DATABASE_URL` uses `fromDatabase` property (auto-linked)
- [ ] `NEXTAUTH_SECRET` uses `generateValue: true`
- [ ] Optional variables (Jina, DataForSEO) marked as `sync: false`

## Build Process

### 6. Build Verification
The build command will:
1. ✅ `npm ci` - Clean install (faster, uses package-lock.json)
2. ✅ `npx prisma generate` - Generate Prisma Client
3. ✅ `npm run build` - Build Next.js application

**Note:** Database migrations are **NOT** run during build. They must be run manually after deployment.

### 7. Build Requirements
- [ ] Node.js version compatible (Render uses latest LTS)
- [ ] All dependencies installable (no platform-specific issues)
- [ ] Prisma Client generates successfully
- [ ] Next.js build completes without errors
- [ ] No missing environment variables during build (they're only checked at runtime)

## Deployment Steps

### 8. Initial Deployment
1. [ ] Push `render.yaml` to GitHub (if using Infrastructure as Code)
2. [ ] Or create services manually in Render dashboard
3. [ ] Set all required environment variables in Render dashboard
4. [ ] Link database service to web service (for auto DATABASE_URL)
5. [ ] Trigger deployment
6. [ ] Monitor build logs for errors

### 9. Database Migrations (CRITICAL - Must Do After First Deploy)

**After deployment completes, run migrations:**

1. Go to Render dashboard → Your Web Service → **Shell** tab
2. Run:
   ```bash
   npx prisma migrate deploy
   ```
3. Verify migrations completed successfully
4. If migrations fail, check database connection and permissions

**Alternative:** Run migrations from local machine:
```bash
# Set DATABASE_URL to your Render database
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# Run migrations
npx prisma migrate deploy
```

### 10. Verification

**Server Startup:**
- [ ] Check Render logs for successful startup
- [ ] Look for: `✅ All required environment variables are set`
- [ ] Look for: `[STARTUP] ✅ No stuck transcription jobs found.`
- [ ] No critical errors in logs

**Application Health:**
- [ ] Health check endpoint (`/`) returns 200
- [ ] Service status shows "Live"
- [ ] Can access application URL

**Functionality:**
- [ ] User signup/registration works
- [ ] Email verification emails sent (check SendGrid)
- [ ] User login works
- [ ] File uploads work (check S3)
- [ ] AI analysis works (check OpenAI usage)
- [ ] Database operations work

## Troubleshooting

### Build Fails
- **Issue:** `prisma generate` fails
  - **Fix:** Check `DATABASE_URL` is accessible during build (may need to set temporarily)
  - **Note:** Prisma Client generation doesn't require DB connection, but schema validation might

- **Issue:** Build timeout
  - **Fix:** Upgrade to higher plan or optimize build process
  - **Note:** Free tier has build time limits

- **Issue:** Missing dependencies
  - **Fix:** Check `package.json` includes all required packages
  - **Fix:** Ensure `npm ci` uses `package-lock.json` (commit it to git)

### Runtime Errors
- **Issue:** Database connection fails
  - **Fix:** Verify `DATABASE_URL` is set correctly
  - **Fix:** Check database service is running
  - **Fix:** Verify network connectivity between services

- **Issue:** Missing environment variables
  - **Fix:** Check `instrumentation.ts` logs for missing vars
  - **Fix:** Set all required variables in Render dashboard
  - **Note:** App will fail to start if required vars are missing

- **Issue:** API errors (OpenAI, Jina, DataForSEO)
  - **Fix:** Verify API keys are correct
  - **Fix:** Check API service status
  - **Note:** Optional APIs won't crash app, just disable features

### Deployment Best Practices

1. **Use `npm ci` instead of `npm install`** (faster, reproducible)
2. **Run migrations separately** - Don't include in build command
3. **Monitor first deployment** - Watch logs carefully
4. **Test after deployment** - Don't assume everything works
5. **Set up monitoring** - Check Render logs regularly

## Post-Deployment

### 11. Optional Optimizations
- [ ] Set up auto-deploy from GitHub (enabled by default)
- [ ] Configure custom domain (if needed)
- [ ] Set up health check monitoring
- [ ] Configure log retention
- [ ] Set up alerts for service downtime

### 12. Security
- [ ] All environment variables marked as "Secret" in Render
- [ ] No secrets committed to GitHub
- [ ] API keys rotated if exposed
- [ ] Database access restricted to web service only

## Render-Specific Notes

### Free Tier Limitations
- Services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds (cold start)
- Build time limits apply
- Consider upgrading for production use

### Production Recommendations
- Use "Starter" plan minimum for better performance
- Enable "Auto-Deploy" from main branch
- Set up manual database backups
- Monitor resource usage (CPU, Memory)

## Support

If deployment fails:
1. Check Render logs for specific errors
2. Verify all environment variables are set
3. Run migrations manually if database errors
4. Check Render Status page for service issues
5. Review this checklist for missed steps
