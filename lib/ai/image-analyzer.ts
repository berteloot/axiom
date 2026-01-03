import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getPresignedDownloadUrl, extractKeyFromS3Url } from "../s3";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// IMAGE ANALYSIS SPECIFIC PROMPT
// ============================================================================
// GPT-4o is multimodal - it can "see" images natively.
// This is extremely valuable for B2B content where the best data often lives
// in infographics, charts, and slide decks (exported as images).
// ============================================================================

const IMAGE_ANALYSIS_RULES = `
*** IMAGE ANALYSIS RULES ***
If the input is an image (Infographic, Chart, Slide, Screenshot):

1. **OCR Everything:** Read ALL text in the image, including:
   - Main headlines and body text
   - Axis labels, footnotes, and legends on charts
   - Small print, watermarks, and attribution text
   - Text in logos, buttons, or UI elements

2. **Describe Visuals:** When extracting a snippet, include the visual context.
   - Example: "Bar chart showing 50% growth" (Context: "Visual chart on slide 3")
   - Example: "Screenshot of dashboard" (Context: "Product UI showing analytics feature")

3. **Charts are Gold:** If you see a chart or data visualization:
   - Extract the specific numbers for the 'atomicSnippets' array with type 'ROI_STAT'
   - Note the chart type (bar, line, pie, etc.)
   - Capture trends and comparisons shown

4. **Infographic Structure:** For infographics:
   - Identify the main narrative flow
   - Extract each data point or statistic separately
   - Note visual hierarchy (what's emphasized)

5. **Slides/Presentations:** For presentation slides:
   - Capture the slide title
   - Extract bullet points as potential snippets
   - Note speaker notes if visible

6. **Screenshots:** For product screenshots or competitor screenshots:
   - Identify what product/tool is shown
   - Extract any visible pricing, features, or metrics
   - Note the context (admin panel, user dashboard, marketing page, etc.)
`;

// Atomic Snippet Schema for image analysis
const ImageSnippetSchema = z.object({
  type: z.enum([
    "ROI_STAT",          // e.g. "Saved 30% on cloud costs"
    "CUSTOMER_QUOTE",    // e.g. "Best tool we've used - CTO of Acme"
    "VALUE_PROP",        // e.g. "The only tool with ISO 27001 cert"
    "COMPETITIVE_WEDGE", // e.g. "Unlike Salesforce, we offer..."
    "DEFINITION",        // e.g. "What is Headless CMS?"
    "VISUAL_DATA"        // NEW: For chart/graph data points
  ]).describe("The category of this extracted information."),

  content: z.string()
    .max(280)
    .describe("The exact text or data extracted from the image. Keep it concise (under 280 chars)."),

  context: z.string()
    .describe("Visual context: where in the image this was found and how it was displayed (e.g., 'Large headline', 'Bar chart Y-axis', 'Footer text')."),
    
  visualElement: z.string().nullable()
    .describe("The type of visual element this was extracted from (e.g., 'bar_chart', 'pie_chart', 'infographic_section', 'slide_title', 'screenshot')."),
    
  confidenceScore: z.number().min(1).max(100)
    .describe("How clear and readable was this text/data? 100 = Crystal clear, perfectly legible."),
});

// Full image analysis schema
const ImageAnalysisSchema = z.object({
  // Overall image classification
  imageType: z.enum([
    "INFOGRAPHIC",
    "CHART_GRAPH", 
    "PRESENTATION_SLIDE",
    "PRODUCT_SCREENSHOT",
    "MARKETING_BANNER",
    "SOCIAL_MEDIA_POST",
    "DOCUMENT_SCAN",
    "OTHER"
  ]).describe("The type of image being analyzed."),
  
  // All extracted text (raw OCR)
  extractedText: z.string()
    .describe("All readable text extracted from the image, preserving structure where possible."),
  
  // Visual description
  visualSummary: z.string()
    .max(500)
    .describe("A brief description of the image's visual elements, layout, and design."),
  
  // Extracted snippets (the gold nuggets)
  snippets: z.array(ImageSnippetSchema)
    .max(10)
    .describe("Extracted valuable data points, stats, and quotes from the image."),
  
  // Data quality assessment
  readabilityScore: z.number().min(1).max(100)
    .describe("Overall image quality for text extraction. 100 = Perfect clarity."),
  
  // Suggested asset type based on image content
  suggestedAssetType: z.enum([
    "Whitepaper", "Case_Study", "Blog_Post", "Infographic", 
    "Webinar_Recording", "Sales_Deck", "Technical_Doc"
  ]).describe("Based on the image content, what type of marketing asset is this likely from?"),
  
  // Key topics identified
  topics: z.array(z.string())
    .max(5)
    .describe("Main topics or themes visible in the image."),
});

export type ImageAnalysisResult = z.infer<typeof ImageAnalysisSchema>;
export type ImageSnippet = z.infer<typeof ImageSnippetSchema>;

// ============================================================================
// MAIN IMAGE ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze an image using GPT-4o's multimodal capabilities.
 * This function handles infographics, charts, slides, and screenshots.
 * 
 * @param s3Url - The S3 URL of the image
 * @param additionalContext - Optional context about the image source
 * @returns Structured analysis of the image content
 */
export async function analyzeImage(
  s3Url: string,
  additionalContext?: string
): Promise<ImageAnalysisResult> {
  try {
    // Get a presigned URL for OpenAI to access the image
    const key = extractKeyFromS3Url(s3Url);
    const imageUrl = key ? await getPresignedDownloadUrl(key, 3600) : s3Url;
    
    const systemPrompt = `You are an expert at extracting data and text from marketing images.
Your goal is to perform comprehensive OCR and visual analysis to extract every valuable piece of information.

${IMAGE_ANALYSIS_RULES}

IMPORTANT:
- Be thorough: Extract ALL visible text, even small print
- Be precise: Numbers and statistics must be exact
- Be contextual: Always note WHERE in the image something was found
- Quality matters: If text is blurry or unclear, lower the confidence score`;

    const userPrompt = additionalContext 
      ? `Analyze this marketing image. Additional context: ${additionalContext}`
      : "Analyze this marketing image. Extract all data, text, and visual information.";

    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        },
      ],
      response_format: zodResponseFormat(ImageAnalysisSchema, "image_analysis"),
      temperature: 0.1, // Keep it very low for accurate OCR
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate structured image analysis");
    }

    return result;

  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
}

// ============================================================================
// HELPER: Check if a file type is an analyzable image
// ============================================================================

const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg", 
  "image/png",
  "image/gif",
  "image/webp"
];

/**
 * Check if a file type is supported for image analysis
 */
export function isAnalyzableImage(fileType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(fileType.toLowerCase());
}

/**
 * Get the image analysis rules to append to other prompts
 * This allows the main ai.ts to include these rules when needed
 */
export function getImageAnalysisRules(): string {
  return IMAGE_ANALYSIS_RULES;
}
