# Account Setup Guide for Asset Organizer

## How to Create Your Account

Asset Organizer uses **magic link email authentication** - no passwords required! Here's how to set up your account:

### Step 1: Access the Sign-In Page

1. Open your browser and navigate to: **`http://localhost:3000`**
2. You'll be automatically redirected to the sign-in page: **`http://localhost:3000/auth/signin`**

### Step 2: Enter Your Email

1. On the sign-in page, enter your email address in the form
2. Click **"Send sign-in link"** button

### Step 3: Check Your Email

**If SendGrid is configured** (SENDGRID_API_KEY in .env):
- ✅ **You'll receive a real email** at the address you entered
- Check your inbox (and spam folder) for "Sign in to Asset Organizer"
- Click the "Sign In" button in the email

**If SendGrid is NOT configured** (Development Mode):
- The verification link will be logged to your **terminal/console** where the server is running
- Look for output like:
  ```
  🔄 [DEV MODE] Email would be sent to: your@email.com
  🔗 Verification URL: http://localhost:3000/api/auth/callback/email?token=...
  ```
- **Copy the verification URL** from the console
- **Paste it directly in your browser** to complete sign-in

### Step 4: Complete Account Setup

1. Click the verification link (or paste it in your browser)
2. NextAuth will automatically:
   - Create your user account (if it doesn't exist)
   - Create a new organization for you
   - Set you as the **OWNER** of that organization
   - Give you a **14-day free trial**
   - Log you into the application

### Step 5: You're Ready!

Once you click the verification link:
- You'll be automatically logged in
- Your organization will be created with a default name (e.g., "My Organization")
- You'll have full OWNER access to all features
- Your 14-day trial starts immediately

---

## What Happens Behind the Scenes

When you sign in for the first time:

1. **User Account Created**: A new user record is created in the database
2. **Organization Created**: A default organization is automatically created
3. **OWNER Role Assigned**: You become the owner of your organization
4. **14-Day Trial Started**: Your organization gets a free 14-day trial
5. **Session Established**: You're logged in and ready to use the app

---

## Production Setup (Email in Production)

For production, you'll need to configure SendGrid:

1. **Get SendGrid API Key**:
   - Sign up at [SendGrid](https://sendgrid.com)
   - Create an API key with email sending permissions
   - Add it to your `.env` file:
     ```bash
     SENDGRID_API_KEY=your-sendgrid-api-key
     EMAIL_FROM=noreply@yourdomain.com
     ```

2. **Set Environment Variables**:
   ```bash
   NEXTAUTH_URL=https://yourdomain.com
   NEXTAUTH_SECRET=your-production-secret
   SENDGRID_API_KEY=your-sendgrid-api-key
   EMAIL_FROM=noreply@yourdomain.com
   ```

3. **Emails Will Work Automatically**: Users will receive real email verification links

---

## Quick Development Workflow

**If SendGrid is configured:**
1. Go to `http://localhost:3000/auth/signin`
2. Enter your email
3. Check your email inbox for the verification link
4. Click the link in the email
5. Done! You're signed in with a new organization

**For local development without SendGrid:**
1. Go to `http://localhost:3000/auth/signin`
2. Enter your email
3. Check your terminal/console for the verification URL
4. Copy and paste the URL in your browser
5. Done! You're signed in with a new organization

---

## Troubleshooting

### Can't find the verification URL?
- Check the terminal where you ran `npm run dev`
- Look for lines starting with `🔄 [DEV MODE]`
- The URL should be there

### Link expired?
- Magic links expire after 24 hours
- Just request a new sign-in link

### Already have an account?
- Enter the same email again
- You'll be logged into your existing account
- If you belong to multiple organizations, you'll see them in the account switcher

---

## After Sign-Up: What's Next?

1. **Upload Assets**: Start uploading your marketing assets
2. **Configure Brand Context**: Set up your organization's brand voice and target industries
3. **Invite Team Members**: If you're setting up an agency, invite colleagues
4. **Explore Admin Settings**: As OWNER, you have access to all admin features
5. **Manage Your Trial**: Keep track of your 14-day trial in the billing section

---

## Need Help?

- Check the terminal logs for email verification URLs in development
- Verify your environment variables are set correctly
- Ensure the development server is running on port 3000

Happy organizing! 🚀