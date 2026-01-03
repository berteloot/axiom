# Security Notes

## API Keys and Secrets

All API keys and secrets are stored as environment variables and are **never exposed to the client-side code**.

### Server-Side Only (Safe)
The following libraries/functions use environment variables and are **only imported by server-side code** (API routes):

- `lib/prisma.ts` - Database connection (uses `DATABASE_URL`)
- `lib/s3.ts` - AWS S3 operations (uses `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`)
- `lib/ai.ts` - OpenAI API (uses `OPENAI_API_KEY`)
- `lib/text-extraction.ts` - Text extraction from files (uses AWS credentials)

### Client Components
Client components (files with `"use client"`) **never** import:
- ❌ `lib/prisma.ts`
- ❌ `lib/s3.ts` (except for type imports from `lib/types.ts`)
- ❌ `lib/ai.ts`
- ❌ `lib/text-extraction.ts`

Client components communicate with the server via API routes only:
- `/api/upload/presigned` - Get presigned S3 upload URL
- `/api/assets/process` - Process uploaded assets
- `/api/assets/preview` - Get presigned download URLs for preview
- `/api/assets` - CRUD operations on assets

### Environment Variables

**Never use `NEXT_PUBLIC_` prefix** for sensitive keys. Variables with `NEXT_PUBLIC_` are exposed to the browser.

All sensitive keys should be:
1. Stored in `.env` file (which is in `.gitignore`)
2. Only accessed in server-side code (API routes, server components)
3. Never logged or exposed in error messages

### Files to Check Before Committing

Before committing code, ensure:
- ✅ No `process.env.*` access in client components
- ✅ No imports of `lib/prisma.ts`, `lib/s3.ts`, `lib/ai.ts` in client components
- ✅ No `NEXT_PUBLIC_` prefix on sensitive keys
- ✅ `.env` file is in `.gitignore`
- ✅ No API keys or secrets in code comments or console.logs
- ✅ No hardcoded credentials anywhere

---

## Recent Security Updates (Jan 1, 2026)

### PDF Processing Security
- ✅ Fixed potential security issue with `pdf-parse` library bundling
- ✅ Added server-side externals configuration to prevent client exposure
- ✅ Improved error handling to prevent information leakage in error messages

### Configuration Changes
Updated `next.config.js` to properly externalize sensitive server-side packages:
- `pdf-parse` - Prevents client-side bundling
- `pdfjs-dist` - Security-focused exclusion
- Canvas-related packages - Native dependencies

---

## Environment Variables Security Checklist

Required environment variables (all server-side only):
- ✅ `DATABASE_URL` - Database connection string
- ✅ `OPENAI_API_KEY` - OpenAI API key
- ✅ `AWS_ACCESS_KEY_ID` - AWS access key
- ✅ `AWS_SECRET_ACCESS_KEY` - AWS secret key
- ✅ `AWS_REGION` - AWS region
- ✅ `AWS_S3_BUCKET_NAME` - S3 bucket name

Never expose these to the client side!

---

**Last Updated**: January 1, 2026  
**Security Status**: ✅ All sensitive keys properly secured
