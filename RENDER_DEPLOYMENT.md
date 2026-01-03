# Render Deployment Guide - Video Deep Search

## Architecture Overview

This app uses a **"Fire and Forget"** background processing pattern optimized for Render's long-running Node.js Web Services.

### Key Differences from Vercel

| Aspect | Vercel (Serverless) | Render (Web Service) |
|--------|---------------------|---------------------|
| **Runtime** | Ephemeral serverless functions | Long-running Node.js process |
| **Background Jobs** | Need `waitUntil()` or external queue | Native "fire and forget" works |
| **Timeouts** | 10-60 seconds | No hard timeout (process stays alive) |
| **Restart Risk** | N/A (stateless) | Jobs can be killed on deploy |

## How It Works

### 1. API Endpoint (`/api/assets/[id]/generate-transcript`)

```typescript
// Creates job record
const job = await prisma.transcriptionJob.create({...});

// FIRE AND FORGET - Don't await!
processVideoAsync(...).catch(err => {
  // Error handling (job already marked as FAILED inside function)
});

// Return immediately
return NextResponse.json({ success: true, jobId: job.id });
```

**Why this works on Render:**
- Node.js keeps the process alive
- Background promises continue after HTTP response
- No need for `@vercel/functions` or external queues

### 2. Background Processing (`processVideoAsync`)

- Downloads video from S3
- Extracts 32kbps mono audio (aggressive compression)
- Sends to Whisper API
- Saves transcript segments to database
- Updates job status with progress (10% → 20% → 50% → 90% → 100%)

### 3. Startup Cleanup (`instrumentation.ts`)

**Problem:** Server restarts (deployments) kill jobs mid-process, leaving them stuck in `PROCESSING` state.

**Solution:** On server startup, automatically:
- Mark `PROCESSING` jobs older than 30 minutes as `FAILED`
- Mark `PENDING` jobs older than 5 minutes as `FAILED`
- Prevents users from seeing stuck spinners

### 4. Frontend Polling

- Polls `/api/assets/[id]/transcript-status` every 2 seconds
- Shows real-time progress updates
- Auto-loads segments when complete
- Shows compression guide on errors

## Processing Strategies

For large videos (>25MB), the system tries multiple strategies:

1. **32kbps Mono Audio Extraction** (for videos <200MB)
   - Fastest approach
   - 1-hour video → ~14MB MP3
   - Fits under Whisper's 25MB limit

2. **First 10 Minutes Only** (for videos >200MB)
   - Skips full extraction (avoids memory issues)
   - Processes just first 10 minutes
   - ~5MB file, processes in 1-2 minutes

3. **Video Chunking** (last resort)
   - Splits into 5-10 minute segments
   - Processes each separately
   - Combines results with adjusted timestamps

## Deployment Checklist

- [x] `instrumentation.ts` cleanup script added
- [x] `next.config.js` instrumentation hook enabled
- [x] Background processing uses "fire and forget"
- [x] Error handling prevents unhandled rejections
- [x] Job status tracking with progress updates
- [x] Frontend polling for status updates

## Future Improvements (High Volume)

If processing 50+ videos simultaneously:

1. **Separate Background Worker Service**
   - Dedicated Render service for video processing
   - Isolates CPU-intensive FFmpeg work
   - Prevents API slowdowns

2. **Redis Queue (BullMQ)**
   - Job queue for better reliability
   - Retry logic for failed jobs
   - Priority queuing

3. **Current Setup is Fine For:**
   - Small to medium teams (<20 concurrent users)
   - Occasional video processing
   - Single Render Web Service

## Monitoring

Check Render logs for:
- `[BACKGROUND]` - Processing status
- `[STARTUP]` - Cleanup results
- `[VIDEO_TRANSCRIBER]` - Strategy selection
- `[FFMPEG]` - Audio extraction progress

## Troubleshooting

**Jobs stuck in PROCESSING:**
- Check if server restarted (cleanup should handle this)
- Check Render logs for FFmpeg errors
- Verify OpenAI API key is valid

**Memory issues:**
- Videos >500MB may cause OOM errors
- Consider using "Process First 10 Minutes Only" button
- Or manually extract audio before upload

**Timeout errors:**
- Shouldn't happen on Render (no hard timeout)
- If seen, check for infinite loops or hanging FFmpeg processes