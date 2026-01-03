# PDF Upload Error - Fixed

## Problem
When uploading PDF files, the asset processing was failing with an ERROR status. The error was:
```
Error extracting text from S3: TypeError: Object.defineProperty called on non-object
```

This was caused by a webpack/Next.js compatibility issue with the `pdf-parse` and `pdfjs-dist` libraries.

## Root Cause
The `pdf-parse` library relies on `pdfjs-dist` which uses Node.js APIs that don't work properly when bundled by Next.js webpack. This caused the text extraction to fail, and since no text could be extracted, the AI analysis failed with "No text content" error.

## Solution Applied

### 1. Updated `next.config.js`
Added webpack configuration to exclude problematic PDF parsing libraries from bundling:
```javascript
serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
webpack: (config, { isServer }) => {
  if (isServer) {
    config.externals.push({
      canvas: 'canvas',
      'pdf-parse': 'pdf-parse',
      'pdfjs-dist': 'pdfjs-dist',
    });
  }
  return config;
}
```

### 2. Improved Error Handling
- Enhanced error messages in `lib/ai.ts` to provide clearer feedback
- Added better logging in `lib/services/asset-processor.ts`

## How to Apply the Fix

1. **Stop your Next.js development server** (Ctrl+C in the terminal)
2. **Restart the server**: `npm run dev`
3. **Re-upload your PDF** or use the "Retry" button on failed assets

## Testing the Fix

1. Navigate to the home page
2. Upload a PDF file (e.g., "2023 State of Marketing AI Report_V2.pdf")
3. The asset should now process successfully with:
   - Status: PROCESSED
   - Extracted text visible
   - ICP targets identified
   - Funnel stage assigned

## Retry Failed Assets

For assets that already failed:
1. Go to the Dashboard
2. Find the asset with ERROR status
3. Click the "Retry" button to reprocess it
4. The asset should now process successfully

## Alternative Solutions (if issue persists)

If the webpack fix doesn't work, here are alternative approaches:

### Option 1: Use a Cloud PDF Service
Replace local PDF parsing with AWS Textract or Google Document AI:
- More reliable
- Better OCR capabilities
- Handles scanned PDFs

### Option 2: Use a Different PDF Library
Switch from `pdf-parse` to `@llama-cloud/pdf` or `pdfreader`:
```bash
npm uninstall pdf-parse
npm install @llama-cloud/pdf
```

### Option 3: Pre-process PDFs
Convert PDFs to images before upload and use OpenAI's vision API for analysis.

## Related Files Changed
- `next.config.js` - Webpack configuration
- `lib/ai.ts` - Error handling
- `lib/services/asset-processor.ts` - Logging improvements
