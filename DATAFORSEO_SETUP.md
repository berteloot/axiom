# DataForSEO Setup Guide

## Overview

The "Just-in-Time" Keyword Research feature uses the DataForSEO API to fetch real-world keyword data when users select a content idea. This provides data-backed SEO strategy recommendations in content briefs.

## Environment Variables

### Local Development (`.env`)

Add these to your `.env` file:

```bash
DATAFORSEO_LOGIN=your_login_here
DATAFORSEO_PASSWORD=your_password_here
```

Next.js automatically loads `.env` files, so no additional configuration is needed.

### Render Deployment

In your Render dashboard:

1. Go to your **Web Service** → **Environment** tab
2. Add these environment variables:
   - `DATAFORSEO_LOGIN` = `your_login_here`
   - `DATAFORSEO_PASSWORD` = `your_password_here`
3. Save and redeploy (or the changes apply on next deploy)

**Note:** The code uses `process.env.DATAFORSEO_LOGIN` and `process.env.DATAFORSEO_PASSWORD`, which works automatically with both local `.env` files and Render's environment variables.

## Getting DataForSEO Credentials

1. Sign up at [https://dataforseo.com/](https://dataforseo.com/)
2. Get your login and password from your account dashboard
3. Add them to your environment variables (local or Render)

## Fallback Behavior

If DataForSEO credentials are **not configured**:
- The system gracefully skips keyword research
- Content briefs still generate successfully
- GPT-4o provides strategic SEO guidance based on the topic and funnel stage
- No errors or crashes occur

This ensures the app works even if you haven't set up DataForSEO yet.

## How It Works

1. **User selects a Content Idea** → Server extracts seed keyword from the idea title/topic
2. **Just-in-Time API Call** → Fetches related keywords from DataForSEO
3. **Strategic Filtering** → Filters keywords by funnel stage:
   - **BOFU**: Prioritizes high CPC (commercial intent)
   - **TOFU**: Prioritizes high search volume (awareness)
   - **MOFU/RETENTION**: Balanced approach
4. **AI Integration** → GPT-4o selects the best keywords and provides implementation guidance
5. **Brief Display** → SEO Strategy card shows primary/secondary keywords and usage notes

## API Details

- **Endpoint**: `https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live`
- **Method**: POST
- **Authentication**: Basic Auth (Base64 encoded `login:password`)
- **Location**: United States (using `location_name` for better readability)
- **Language**: English
- **Request Parameters**:
  - `limit`: 20 keywords requested (for better selection)
  - `depth`: 1 (can go up to 4 for more keywords)
  - `include_seed_keyword`: true
  - `filters`: Only keywords with search_volume > 0
  - `order_by`: Pre-sorted by search volume (descending)
- **Response**: Returns top 20 keywords, filtered to top 5 by strategy based on funnel stage

**References:**
- [DataForSEO API v3 Documentation](https://docs.dataforseo.com/v3/)
- [Related Keywords Live Endpoint](https://docs.dataforseo.com/v3/dataforseo_labs-related_keywords-live/)

## Troubleshooting

**"Keyword research data is not available"**:
- Check that `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` are set correctly
- Verify your DataForSEO account has API credits
- Check server logs for API errors (they won't crash the app)

**No keywords returned**:
- The API may return empty results for very niche topics
- The system handles this gracefully and still generates SEO guidance
- Try using a more general seed keyword in your content idea title

## Cost Considerations

DataForSEO uses a credit-based system. Each keyword research request consumes credits. Monitor your usage in the DataForSEO dashboard to avoid unexpected charges.
