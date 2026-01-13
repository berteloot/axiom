# Deployment Guide - Asset Organizer

This guide will help you deploy the Asset Organizer application to GitHub and Render.

---

## 📋 Prerequisites

Before deploying, ensure you have:

- ✅ A GitHub account
- ✅ A Render account (sign up at https://render.com)
- ✅ AWS account with S3 bucket created
- ✅ OpenAI API key
- ✅ SendGrid account (for email authentication)
- ✅ Jina AI account (optional, for website scanning features)

---

## 🚀 Step 1: Prepare GitHub Repository

### 1.1 Initialize Git Repository (if not already done)

```bash
cd "/Users/stanislasberteloot/Projects/Nytro-Apps/Asset Organizer"
git init
git add .
git commit -m "Initial commit"
```

### 1.2 Connect to Existing GitHub Repository

Your repository is already created at: `https://github.com/berteloot/axiom.git`

### 1.3 Push to GitHub

```bash
# Add the remote (if not already added)
git remote add origin https://github.com/berteloot/axiom.git

# Or if remote exists but points elsewhere, update it:
# git remote set-url origin https://github.com/berteloot/axiom.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## 🗄️ Step 2: Set Up Database on Render

### 2.1 Create PostgreSQL Database

1. Log in to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `asset-organizer-db` (or your preferred name)
   - **Database**: `asset_organizer`
   - **User**: `asset_organizer_user`
   - **Region**: Choose closest to your users (e.g., `Oregon`)
   - **Plan**: Start with `Starter` (Free tier)
   - **PostgreSQL Version**: 15

4. Click **"Create Database"**
5. **Wait for database to be created** (takes ~2-3 minutes)

### 2.2 Get Database Connection String

1. Once created, click on your database
2. Under **"Connections"**, copy the **"Internal Database URL"**
   - Format: `postgresql://user:password@host:5432/database`
   - **Keep this secure!** You'll use it in Step 4

### 2.3 Run Database Migrations (Local Development)

Before deploying, run migrations locally to test:

```bash
# Make sure your .env has the Render database URL
DATABASE_URL="postgresql://user:password@host:5432/database"

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate
```

---

## 🔧 Step 3: Set Up AWS S3

### 3.1 Create S3 Bucket

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click **"Create bucket"**
3. Configure:
   - **Bucket name**: `your-app-name-assets` (must be globally unique)
   - **Region**: Match your Render region if possible
   - **Block Public Access**: Keep enabled (we use presigned URLs)
4. Click **"Create bucket"**

### 3.2 Create IAM User for S3 Access

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click **"Users"** → **"Add users"**
3. **User name**: `asset-organizer-s3-user`
4. Select **"Programmatic access"**
5. Click **"Next: Permissions"**
6. Click **"Attach existing policies directly"**
7. Search and select: **"AmazonS3FullAccess"** (or create a more restrictive policy)
8. Click **"Next"** → **"Create user"**
9. **IMPORTANT**: Copy both:
   - **Access key ID** (e.g., `AKIA...`)
   - **Secret access key** (e.g., `wJalr...`) - **Only shown once!**

### 3.3 Configure CORS (Optional but Recommended)

If you need direct browser uploads, configure CORS on your S3 bucket:

```bash
# Use the provided script
npm run s3:set-cors
```

Or manually set CORS in AWS Console:
1. Go to your S3 bucket → **"Permissions"** → **"CORS"**
2. Add CORS configuration (see `s3-cors-config.json` for reference)

---

## 📧 Step 4: Set Up SendGrid (Email)

### 4.1 Create SendGrid Account

1. Sign up at [SendGrid](https://sendgrid.com/)
2. Verify your account

### 4.2 Create API Key

1. Go to **"Settings"** → **"API Keys"**
2. Click **"Create API Key"**
3. **API Key Name**: `Asset Organizer Production`
4. **API Key Permissions**: **"Full Access"** (or restrict to Mail Send)
5. Click **"Create & View"**
6. **Copy the API key** (e.g., `SG.xxx...`) - **Only shown once!**

### 4.3 Verify Sender Email

1. Go to **"Settings"** → **"Sender Authentication"**
2. Verify a single sender email (e.g., `noreply@yourdomain.com`)
   - Or set up domain authentication for better deliverability
3. **Remember the verified email** - you'll use it as `EMAIL_FROM`

---

## 🤖 Step 5: Set Up OpenAI API

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Click **"API Keys"** → **"Create new secret key"**
3. **Name**: `Asset Organizer Production`
4. **Copy the API key** (e.g., `sk-proj-xxx...`) - **Only shown once!**

---

## 🌐 Step 6: Set Up Jina AI (Optional)

Jina AI is used for website scanning features. It's optional but recommended:

1. Sign up at [Jina AI](https://jina.ai/reader/)
2. Go to **"API Keys"**
3. Create a new API key
4. **Copy the API key** (e.g., `jina_xxx...`)
5. Includes 10M free tokens for non-commercial use

---

## 🚢 Step 7: Deploy to Render

### 7.1 Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository:
   - Click **"Connect account"** if not already connected
   - Select your repository: `berteloot/axiom`
   - Click **"Connect"**

### 7.2 Configure Service

**Basic Settings:**
- **Name**: `asset-organizer` (or your preferred name)
- **Region**: Match your database region (e.g., `Oregon`)
- **Branch**: `main` (or your default branch)
- **Runtime**: `Node`
- **Build Command**: `npm ci && npx prisma generate && npm run build`
- **Start Command**: `npm start`
- **Plan**: Start with `Starter` (Free tier)

**Environment Variables:**

Add the following environment variables in the Render dashboard:

```
# Database (auto-populated if you link the database service)
DATABASE_URL=<Internal Database URL from Step 2.2>

# Node Environment
NODE_ENV=production

# NextAuth Configuration
NEXTAUTH_URL=https://your-app-name.onrender.com
NEXTAUTH_SECRET=<Generate with: openssl rand -base64 32>

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<From Step 3.2>
AWS_SECRET_ACCESS_KEY=<From Step 3.2>
AWS_S3_BUCKET_NAME=<From Step 3.1>

# OpenAI Configuration
OPENAI_API_KEY=<From Step 5>
OPENAI_WEB_SEARCH_MODEL=gpt-4o  # Optional: Model for web search (defaults to gpt-5, set to gpt-4o if you don't have gpt-5 access)

# SendGrid Configuration
SENDGRID_API_KEY=<From Step 4.2>
EMAIL_FROM=noreply@yourdomain.com

# Jina AI Configuration (Optional)
JINA_API_KEY=<From Step 6>

# DataForSEO Configuration (Optional - for keyword research)
DATAFORSEO_LOGIN=<Your DataForSEO login>
DATAFORSEO_PASSWORD=<Your DataForSEO password>
```

**To set environment variables:**
1. Scroll down to **"Environment Variables"** section
2. Click **"Add Environment Variable"** for each variable
3. For `NEXTAUTH_SECRET`, generate one locally:
   ```bash
   openssl rand -base64 32
   ```

### 7.3 Link Database Service (Optional but Recommended)

1. Scroll down to **"Database"** section
2. Click **"Link Database"**
3. Select your database: `asset-organizer-db`
4. This will auto-populate `DATABASE_URL`

### 7.4 Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Install dependencies
   - Run build command
   - Start the service
3. **First deployment takes ~5-10 minutes**

---

## 🔄 Step 8: Run Database Migrations

**⚠️ CRITICAL:** Database migrations must be run **after** the first deployment. The build process does NOT run migrations automatically.

### Option 1: Using Render Shell (Recommended)

1. In Render dashboard, go to your web service
2. Click **"Shell"** tab
3. Run:
   ```bash
   npx prisma migrate deploy
   ```
4. Verify migrations completed successfully (check output for "Applied migration...")

### Option 2: From Local Machine

```bash
# Set DATABASE_URL to your Render database URL
export DATABASE_URL="postgresql://user:password@host:5432/database"

# Run migrations
npm run db:migrate
```

---

## ✅ Step 9: Verify Deployment

### 9.1 Check Service Status

1. In Render dashboard, check that service status is **"Live"**
2. Check logs for any errors

### 9.2 Test the Application

1. Visit your app URL: `https://your-app-name.onrender.com`
2. Test key features:
   - ✅ User registration/signup
   - ✅ Email verification (check SendGrid logs)
   - ✅ File upload to S3
   - ✅ AI analysis (check OpenAI usage)
   - ✅ Database operations

### 9.3 Monitor Logs

In Render dashboard:
- **"Logs"** tab: Real-time application logs
- **"Events"** tab: Deployment history
- **"Metrics"** tab: CPU, Memory, Request metrics

---

## 🔐 Step 10: Security Checklist

Before going to production:

- [ ] All environment variables are set (no defaults in code)
- [ ] `NEXTAUTH_SECRET` is a strong, randomly generated value
- [ ] `NEXTAUTH_URL` matches your production domain
- [ ] AWS credentials have minimal required permissions
- [ ] Database connection uses SSL (Render handles this)
- [ ] Email sender is verified in SendGrid
- [ ] No sensitive data in GitHub repository
- [ ] `.env` file is in `.gitignore`

---

## 🐛 Troubleshooting

### Build Fails

**Error: Prisma Client not generated**
```bash
# Solution: Build command should include prisma generate
Build Command: npm ci && npx prisma generate && npm run build
```

**Error: Build timeout**
- Free tier has build time limits (~15 minutes)
- Consider upgrading to Starter plan if builds consistently timeout
- Optimize by using `npm ci` instead of `npm install` (faster)

**Error: Module not found**
- Check `package.json` dependencies
- Ensure all dependencies are listed (not just devDependencies for production)

### Application Won't Start

**Error: Database connection failed**
- Verify `DATABASE_URL` is set correctly
- Check database service is running
- Verify database allows connections from Render

**Error: NEXTAUTH_SECRET missing**
- Ensure `NEXTAUTH_SECRET` is set in environment variables
- Generate a new one: `openssl rand -base64 32`

**Error: S3 access denied**
- Verify AWS credentials are correct
- Check IAM user has S3 permissions
- Verify bucket name matches `AWS_S3_BUCKET_NAME`

### Runtime Errors

**Error: Email not sending**
- Check SendGrid API key is correct
- Verify sender email is verified in SendGrid
- Check SendGrid logs in dashboard

**Error: OpenAI API error**
- Verify API key is correct
- Check API key has sufficient credits
- Check OpenAI usage dashboard

---

## 📈 Step 11: Optional Improvements

### Custom Domain

1. In Render dashboard, go to your web service
2. Click **"Settings"** → **"Custom Domains"**
3. Add your domain (e.g., `app.yourdomain.com`)
4. Follow DNS configuration instructions
5. Update `NEXTAUTH_URL` environment variable

### SSL/HTTPS

- Render automatically provides SSL certificates
- No additional configuration needed

### Auto-Deploy from GitHub

- Enabled by default
- Every push to `main` branch triggers a new deployment
- Configure branch in **"Settings"** → **"Auto-Deploy"**

### Environment-Specific Deployments

- Create separate services for `staging` and `production`
- Use different branches: `staging` and `main`
- Use different environment variables for each

### Database Backups

1. Go to your database service
2. Click **"Backups"** tab
3. Enable automatic backups (available on paid plans)
4. Or set up manual backups

### Monitoring & Alerts

1. Go to **"Settings"** → **"Alerts"**
2. Set up email alerts for:
   - Service down
   - High error rate
   - High memory usage

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [AWS S3 Setup Guide](./S3_SETUP_GUIDE.md)
- [Render Deployment Notes](./RENDER_DEPLOYMENT.md)

---

## 🆘 Support

If you encounter issues:

1. Check Render logs: Dashboard → Your Service → Logs
2. Check application logs for error messages
3. Verify all environment variables are set correctly
4. Test database connection using Prisma Studio locally
5. Review this guide's troubleshooting section

---

**Last Updated**: January 2026
