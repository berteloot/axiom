import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Request body validation schema
const GenerateDraftRequestSchema = z.object({
  brief: z.object({
    strategicPositioning: z.object({
      whyThisMatters: z.string(),
      painClusterAddress: z.string(),
      trendingTopicsIntegration: z.string().nullable().optional(),
      differentiation: z.string(),
    }),
    contentStructure: z.object({
      recommendedSections: z.array(
        z.object({
          title: z.string(),
          keyMessages: z.array(z.string()),
          dataPoints: z.array(z.string()).nullable().optional(),
          trendingTopicReferences: z.array(z.string()).nullable().optional(),
        })
      ),
      totalEstimatedWords: z.number(),
    }),
    toneAndStyle: z.object({
      brandVoiceGuidance: z.string(),
      icpSpecificTone: z.string(),
      whatToAvoid: z.array(z.string()),
    }),
    successMetrics: z.object({
      whatMakesThisSuccessful: z.string(),
      howToUseInSales: z.string(),
      engagementIndicators: z.array(z.string()),
    }),
    contentGapsToAddress: z.array(z.string()),
  }),
  idea: z.object({
    title: z.string().min(1),
    assetType: z.enum([
      "Whitepaper",
      "Case_Study",
      "Blog_Post",
      "Infographic",
      "Webinar_Recording",
      "Sales_Deck",
      "Technical_Doc",
    ]),
    strategicRationale: z.string().optional(),
    trendingAngle: z.string().nullable().optional(),
    keyMessage: z.string().optional(),
    painClusterAddressed: z.string().optional(),
    format: z.string().optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
  }),
  gap: z.object({
    icp: z.string().min(1, "ICP is required"),
    stage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]),
    painCluster: z.string().nullable().optional(),
  }),
  trendingSources: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().min(1),
      content: z.string().optional(),
      relevance: z.enum(["high", "medium", "low"]).optional(),
      sourceType: z.enum(["consulting", "industry_media", "research", "other"]),
      isReputable: z.boolean().optional(),
    })
  ).optional().default([]),
});

const ContentDraftSchema = z.object({
  title: z.string().describe("Final content title"),
  content: z.string().describe("Complete content draft ready for use"),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      sourceType: z.enum(["consulting", "industry_media", "research", "other"]),
      citation: z.string().describe("How to cite this source in the content, or general description if not directly cited"),
    })
  ).describe("ALL reputable sources provided (must include all sources even if not all were cited in content)"),
  factCheckNotes: z.array(z.string())
    .describe("Important facts, statistics, or claims that should be verified before publication"),
  wordCount: z.number().describe("Approximate word count"),
  estimatedReadTime: z.number().describe("Estimated reading time in minutes"),
});

/**
 * Determine source reputability server-side based on sourceType and domain patterns
 * This prevents clients from setting isReputable: true for untrustworthy sources
 */
function determineSourceReputability(source: {
  url: string;
  sourceType: string;
  title: string;
}): boolean {
  // Always mark "other" as non-reputable
  if (source.sourceType === "other") {
    return false;
  }

  // Consulting, industry_media, and research types are generally reputable
  // But we can add domain-based validation if needed
  const reputableTypes: string[] = ["consulting", "industry_media", "research"];
  if (reputableTypes.includes(source.sourceType)) {
    return true;
  }

  return false;
}

/**
 * Cap total source text budget and trim individual sources
 * Returns array of sources with trimmed content
 */
function prepareSourceExcerpts(
  sources: Array<{ content?: string; [key: string]: any }>,
  maxTotalChars: number = 10000,
  maxPerSourceChars: number = 800
): Array<{ content: string; [key: string]: any }> {
  let totalChars = 0;
  const prepared: Array<{ content: string; [key: string]: any }> = [];

  for (const source of sources) {
    if (!source.content || source.content.trim().length < 50) {
      continue;
    }

    const remainingBudget = maxTotalChars - totalChars;
    if (remainingBudget <= 0) {
      break;
    }

    const sourceContent = source.content.trim();
    const maxForThisSource = Math.min(maxPerSourceChars, remainingBudget);
    const excerpt = sourceContent.length > maxForThisSource
      ? sourceContent.substring(0, maxForThisSource) + "\n[Content truncated...]"
      : sourceContent;

    totalChars += excerpt.length;
    prepared.push({
      ...source,
      content: excerpt,
    });
  }

  return prepared;
}

/**
 * Deduplicate sources by URL (used for reputable sources and output)
 */
function dedupeSourcesByUrl<T extends { url: string }>(sources: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of sources) {
    const url = (s.url || "").trim();
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(s);
  }
  return out;
}

/**
 * Fix sources section in content if it contains placeholder URLs
 * Replaces placeholder "URL" text with actual URLs from sources array
 */
function fixSourcesSectionInContent(
  content: string,
  sources: Array<{ url: string; title: string; sourceType: string }>
): string {
  if (!content || !sources || sources.length === 0) {
    return content;
  }

  // Check if content contains a sources section with placeholder URLs
  // Match various markdown formats: ## Sources, ## Source, ## References, etc.
  const sourcesSectionRegex = /##\s+(Sources?|References?)\s*\n\n((?:- \[.*?\]\([^)]+\)[^\n]*\n?)+)/i;
  const match = content.match(sourcesSectionRegex);
  
  if (!match) {
    return content;
  }

  const sourcesSection = match[2];
  
  // Check if it contains placeholder "URL" (case-insensitive, with or without parentheses)
  if (!/\(URL\)|\(url\)|URL|url/i.test(sourcesSection)) {
    return content; // No placeholder found, content is fine
  }

  // Build the corrected sources section
  const correctedSources = sources.map((source) => {
    const sourceTypeLabel = source.sourceType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return `- [${source.title}](${source.url}) - ${sourceTypeLabel}`;
  }).join('\n');

  // Replace the sources section with corrected version
  const correctedContent = content.replace(
    sourcesSectionRegex,
    `## Sources\n\n${correctedSources}\n`
  );

  return correctedContent;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate and get account ID (will throw if not authenticated)
    let accountId: string;
    try {
      accountId = await requireAccountId(request);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = GenerateDraftRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed",
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const { brief, idea, gap, trendingSources: providedSources } = validationResult.data;

    // Fetch brand context
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
    });

    if (!brandContext) {
      return NextResponse.json(
        { error: "Brand context not found. Please set up your brand identity first." },
        { status: 404 }
      );
    }

    // Build brand context string with safe fallbacks
    const brandVoiceText = brandContext.brandVoice.length > 0
      ? brandContext.brandVoice.join(", ")
      : "Professional, Customer-Centric";

    const primaryICPRolesText = brandContext.primaryICPRoles.length > 0
      ? brandContext.primaryICPRoles.join(", ")
      : "Not specified";

    const painClustersText = brandContext.painClusters.length > 0
      ? brandContext.painClusters.join(", ")
      : "Not specified";

    const defaultPainCluster = gap.painCluster ?? brandContext.painClusters[0] ?? "Not specified";

    const brandContextText = `
BRAND IDENTITY:
- Brand Voice: ${brandVoiceText}
- Primary ICP Roles: ${primaryICPRolesText}
- Pain Clusters: ${painClustersText}
- Value Proposition: ${brandContext.valueProposition || "Not specified"}
- ROI Claims: ${brandContext.roiClaims.length > 0 ? brandContext.roiClaims.join(", ") : "Not specified"}
- Key Differentiators: ${brandContext.keyDifferentiators.length > 0 ? brandContext.keyDifferentiators.join(", ") : "Not specified"}
- Use Cases: ${brandContext.useCases.length > 0 ? brandContext.useCases.join(", ") : "Not specified"}
`;

    // Determine reputability server-side for ALL provided sources (do not trust client isReputable)
    const sourcesWithReputability = dedupeSourcesByUrl((providedSources || []).map((source) => ({
      ...source,
      isReputable: determineSourceReputability(source),
    })));

    // Reputable sources (metadata) that MUST be included in the sources array
    const reputableSourcesAll = sourcesWithReputability.filter(
      (s) => s.isReputable && s.sourceType !== "other"
    );

    // Reputable sources that also include usable content extracts (for inline citations)
    const reputableSourcesWithContent = reputableSourcesAll.filter(
      (s) => s.content && s.content.trim().length > 50
    );

    // Cap total source text budget to avoid token blow-up
    const preparedSources = prepareSourceExcerpts(
      reputableSourcesWithContent,
      10000, // Max 10k chars total
      800    // Max 800 chars per source
    );

    const sourcesText = reputableSourcesAll.length > 0
      ? `
🔴 CRITICAL: SOURCE CONTENT BELOW - ONLY USE FACTS FROM THESE EXTRACTS

REPUTABLE SOURCES (MUST BE INCLUDED IN YOUR OUTPUT sources ARRAY):
${reputableSourcesAll.map((s, i) => `
SOURCE ${i + 1}:
- Title: ${s.title}
- URL: ${s.url}
- Type: ${s.sourceType}
`).join("\n")}

${preparedSources.length > 0 ? `
REPUTABLE SOURCES WITH EXTRACTED CONTENT (THE ONLY PLACE YOU MAY TAKE FACTS/STATS FROM):
${preparedSources.map((s, i) => `
EXTRACT ${i + 1}:
- Title: ${s.title}
- URL: ${s.url}
- Type: ${s.sourceType}
- Content Extract:
${s.content}
---
`).join("\n")}
` : `
⚠️ NONE OF THE REPUTABLE SOURCES INCLUDED USABLE CONTENT EXTRACTS.
You must NOT include specific statistics, numbers, or named case studies.
Use generic language and put any specific claims into factCheckNotes.
`}

🔴 CRITICAL RULES FOR USING SOURCES:
1. **ONLY cite statistics, data, or facts that appear in the content extracts above**
2. **If a statistic is NOT in the extracts, DO NOT use it** - Mark it for fact-checking instead
3. **If you want to reference a general trend but don't have a specific number in the extracts, use generic language**
4. **When citing, use publication names from the source titles**
5. **NEVER invent case studies** - If sources don't mention a company, don't create it
`
      : `
⚠️ NO REPUTABLE SOURCES PROVIDED

You have NO reputable sources. This means:
- **DO NOT invent statistics or percentages**
- **DO NOT create fake case studies or company names**
- **Use generic language**
- **Mark ALL specific claims for fact-checking** in factCheckNotes
`;

    const systemPrompt = `You are a Senior B2B Content Writer creating a complete, publication-ready content draft.

🔴 CRITICAL: WEB SEARCH & SOURCE REQUIREMENTS:
- This content MUST be backed by reputable sources found through web search
- ALL statistics, data points, and claims MUST be supported by the provided source URLs
- You MUST include ALL reputable source URLs in the sources array
- Source URLs are essential for credibility and fact-checking
- If sources are provided, you MUST use them and cite them properly
- Never create content without proper source attribution

🔴 CRITICAL FACT-CHECKING RULES (MANDATORY - NO EXCEPTIONS):
1. **NEVER make up facts, statistics, or numbers** - ONLY use data that appears in the source content extracts provided below
2. **NEVER invent case studies, company names, or examples** - If a source doesn't mention "Company X", you CANNOT create it
3. **NEVER infer statistics from source content** - If a source says "many companies struggle", you CANNOT turn that into "60% of companies"
4. **If you don't have a specific fact in the source content, you MUST:**
   - Remove the specific claim (no fake percentages)
   - Mark it for fact-checking in the factCheckNotes
   - Use generic language ONLY ("many companies" instead of "73% of companies")
5. **Source verification process:**
   - Before citing ANY statistic, verify it appears in the source content extracts
   - If it's not there, DON'T use it
   - If you're unsure, mark it for fact-checking
6. **Case study rules:**
   - If sources mention a real company with real results, you can reference it
   - If sources don't mention specific companies, DO NOT create "Company X" examples
   - Use generic examples instead ("A logistics company" not "Company X")
7. **Be transparent** - Mark ALL claims that aren't directly from source content

Your goal is to create a complete, publication-ready content draft that:
1. **Solves the pain cluster(s)** - Clearly demonstrates how to solve the identified pain cluster
2. Follows the content brief structure exactly
3. Uses brand voice consistently
4. Includes source citations for all data/statistics
5. **MUST include ALL reputable sources provided in the sources array** - Even if you didn't cite them directly
6. Is ready for immediate use (with fact-checking of marked items)

🔴 CRITICAL: The "sources" array in your response MUST include every reputable source that was provided to you above. This is mandatory - do not omit any sources.

B2B CONTENT BEST PRACTICES:
- Problem-first structure (agitate pain, then present solution)
- Use specific data and metrics (ONLY from provided sources)
- Address business outcomes, not just features
- Include quantifiable benefits (ONLY if you have sources)
- Use industry-specific terminology appropriately
- Clear, direct language

AVOID AI WRITING TRAPS:
❌ NEVER use: "delve", "tapestry", "landscape", "game-changer", "unlocking", "unleash", "realm"
❌ NEVER use: Generic phrases like "best-in-class", "industry-leading" without proof
❌ NEVER use: Engagement bait ("Agree?", "Thoughts?", "What do you think?")
❌ NEVER use: Vague qualifiers without justification
❌ NEVER make up statistics or facts

✅ DO use: Specific metrics from sources (with citations)
✅ DO use: Concrete examples from sources
✅ DO use: Problem-first structure
✅ DO use: Clear, direct language
✅ DO cite sources for all data/statistics

${brandContextText}
${sourcesText}`;

    // Determine if we should use section-by-section generation for longer content
    const isLongForm = idea.assetType === "Whitepaper" || 
                      idea.assetType === "Case_Study" || 
                      brief.contentStructure.totalEstimatedWords > 2000;

    // Determine content format requirements based on asset type
    const isNonTextContent = idea.assetType === "Infographic" || idea.assetType === "Webinar_Recording";
    
    const formatSpecificInstructions = isNonTextContent
      ? idea.assetType === "Infographic"
        ? `
🔴 INFOGRAPHIC CONTENT DRAFT REQUIREMENTS:

You must create a COMPLETE, PRODUCTION-READY infographic content draft that includes:

1. **Visual Structure & Layout**:
   - Detailed section-by-section breakdown of visual elements
   - Layout description (e.g., "Top banner with headline", "Left column with statistics", "Center flow diagram")
   - Visual hierarchy and flow
   - Color scheme suggestions (if relevant to brand)
   - Typography recommendations (headlines, body text, captions)

2. **Content for Each Visual Section**:
   - Exact text for headlines, subheadings, and body copy
   - Statistics and data points formatted for visual display
   - Callout boxes with key messages
   - Icon/graphic suggestions for each section
   - Data visualizations needed (charts, graphs, diagrams)

3. **Visual Elements Description**:
   - Specific charts/graphs needed (bar chart, pie chart, flow diagram, etc.)
   - Icons or illustrations required
   - Visual metaphors or imagery suggestions
   - Any infographic-specific elements (timelines, comparisons, before/after, etc.)

4. **Production Notes**:
   - Dimensions and format recommendations
   - File format suggestions (for designer reference)
   - Accessibility considerations (alt text, color contrast)
   - Social media variations (if applicable)

5. **Source Citations**:
   - All statistics must be cited with source URLs
   - Include a "Sources" section at the bottom of the infographic content
   - Format citations for visual display (compact, readable)

The draft should be structured so a designer can immediately start creating the visual infographic. Include ALL text content, data points, and visual specifications needed for production.
`
        : `
🔴 WEBINAR RECORDING CONTENT DRAFT REQUIREMENTS:

You must create a COMPLETE, PRODUCTION-READY webinar script/outline that includes:

1. **Webinar Structure**:
   - Opening hook (first 30 seconds)
   - Introduction and agenda
   - Main content sections (3-5 key sections)
   - Q&A preparation section
   - Closing call-to-action

2. **Detailed Script for Each Section**:
   - Speaker notes and talking points
   - Exact transitions between sections
   - Key messages to emphasize
   - Visual aids/slides needed for each section
   - Timing estimates for each segment

3. **Slide Deck Outline**:
   - Slide-by-slide breakdown with:
     * Slide title
     * Key bullet points or content
     * Visual suggestions (charts, diagrams, images)
     * Speaker notes for each slide

4. **Interactive Elements**:
   - Poll questions to engage audience
   - Discussion prompts
   - Breakout session suggestions (if applicable)
   - Q&A preparation (anticipated questions and answers)

5. **Supporting Materials**:
   - Handout/one-pager content
   - Follow-up email content
   - Social media promotion copy

6. **Source Citations**:
   - All statistics and data must be cited
   - Include source URLs in speaker notes
   - Reference sources during presentation (verbal citations)

7. **Production Notes**:
   - Recommended duration
   - Technical requirements
   - Platform-specific considerations
   - Recording tips

The draft should be a complete script/outline that a presenter can use to deliver the webinar. Include ALL content, talking points, and production guidance needed.
`
      : "";

    const userPrompt = `Create a complete, publication-ready content draft based on this brief:

CONTENT BRIEF:
${JSON.stringify(brief, null, 2)}

SELECTED IDEA:
- Title: ${idea.title}
- Asset Type: ${idea.assetType}
- ICP: ${gap.icp}
- Funnel Stage: ${gap.stage}
- Pain Cluster: ${defaultPainCluster}

${isLongForm ? `
⚠️ LONG-FORM CONTENT DETECTED:
This is a ${idea.assetType} targeting ${brief.contentStructure.totalEstimatedWords} words.
- Maintain coherence across all sections
- Ensure each section builds on the previous one
- Keep the pain cluster solution thread consistent throughout
` : ""}
${formatSpecificInstructions}

REQUIREMENTS:

1. **Content Structure**: Follow the brief's recommended sections exactly
   ${brief.contentStructure.recommendedSections.map((section, idx) => `
   Section ${idx + 1}: ${section.title}
   - Key messages: ${section.keyMessages.join(", ")}
   - How this solves pain cluster: ${section.title} must demonstrate HOW it solves ${defaultPainCluster}
   `).join("")}

2. **Pain Cluster Solution**: Every section must demonstrate HOW to solve: ${defaultPainCluster}

3. **Source Citations** (CRITICAL - EDITORIAL BEST PRACTICES): 
   - **ONLY cite statistics/facts that appear in the source content extracts above**
   - **VERIFY BEFORE CITING**: Before writing any statistic, check if it appears in the source content extracts
   - **If a statistic is NOT in the source content, DO NOT use it** - Use generic language instead
   
   **EDITORIAL CITATION FORMAT (MANDATORY):**
   - **For verbatim quotes**: Use quotation marks and cite: "[exact quote]" (Source Publication Name, Year if available)
   - **For statistics/data**: "According to [Publication Name], [exact fact from source]" or "[Publication Name] reports that [exact fact]"
   - **For paraphrased content**: "[Publication Name] found that [paraphrased content]" or "Research from [Publication Name] indicates [paraphrased content]"
   - **Always use the publication name** (from source title), not just "a study" or "research"
   - **Include source URLs** in the sources array, but citations in text should use publication names
   
   **Examples:**
   - ✅ CORRECT: "According to McKinsey & Company, 60% of companies report operational challenges" (if this exact stat appears in source)
   - ✅ CORRECT: "McKinsey & Company found that 'operational efficiency remains a critical focus for many organizations'" (verbatim quote)
   - ❌ INCORRECT: "According to a recent study, 60% of companies..." (no publication name)
   - ❌ INCORRECT: "Research shows that many companies struggle" (vague, no source)

4. **Case Studies** (STRICT RULES):
   - **If sources mention real companies with real results, you can reference them by name**
   - **If sources don't mention specific companies, DO NOT create "Company X" or any fake company examples**
   - **DO NOT invent company names, metrics, or results**
   - Use generic examples ONLY: "A logistics company" or "One organization" or "Industry leaders" instead of fake company names
   - **If you want to illustrate a point but don't have a real case study, use hypothetical language**: "Imagine a company that..." or "Consider a scenario where..."

5. **Fact-Checking**: 
   - Mark ALL specific statistics/percentages that aren't explicitly in source content
   - Mark ALL case studies that aren't mentioned in sources
   - Mark ALL specific claims that need verification
   - Be aggressive with fact-checking - when in doubt, mark it

6. **Word Count**: Target ${brief.contentStructure.totalEstimatedWords} words
7. **Brand Voice**: ${brandVoiceText}
8. **ICP Focus**: Write for ${gap.icp}

🔴 FINAL REMINDER (READ THIS CAREFULLY): 
- **If you don't see a statistic in the source content extracts above, you CANNOT use it** - Use generic language instead
- **If you don't see a company name in the source content extracts above, you CANNOT create a case study with it** - Use generic examples instead
- **When in doubt, use generic language and mark for fact-checking**
- **Better to be generic and accurate than specific and wrong**

🔴 CRITICAL OUTPUT REQUIREMENT - SOURCES ARRAY:
You MUST include ALL reputable sources that were provided to you in the "sources" array of your response, even if you didn't cite them directly in the content.

For EACH source provided above, include it in the sources array with:
- url: The exact URL from the source
- title: The exact title from the source
- sourceType: The exact sourceType from the source (consulting, industry_media, research, or other)
- citation: A suggested citation format for this source (e.g., "According to [Title], [brief description of what this source covers]")

Example sources array entry:
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "sourceType": "consulting",
  "citation": "According to Article Title, AI tools can improve operational efficiency in customer service."
}

If you used facts from a source in your content, make sure the citation reflects what you actually cited.
If you didn't use a source but it was provided, still include it with a general citation about what the source covers.

OUTPUT REQUIREMENTS:
- Complete content draft ready for publication (after fact-checking marked items)
${isNonTextContent 
  ? `- **For ${idea.assetType}**: Create a production-ready draft that includes all content, structure, and specifications needed to produce the final asset
- **All text content** that will appear in the final asset (headlines, body copy, captions, speaker notes, etc.)
- **Visual/structure specifications** needed for production (layout, slides, visual elements)
- **Source citations** must be included in the content and formatted appropriately for the asset type`
  : `- **Content must include inline citations** using publication names (e.g., "According to McKinsey & Company...")
- **At the end of the content**, add a "Sources" or "References" section listing all sources used:
  
  ## Sources
  
  - [Publication Name](ACTUAL_URL_FROM_SOURCE) - Source Type
  - [Publication Name](ACTUAL_URL_FROM_SOURCE) - Source Type
  
  **CRITICAL**: You MUST use the actual URL from each source's url field, NOT the literal text "URL". 
  For each source in the sources array, use:
  - The source's title as the link text [title]
  - The source's url as the link destination (url)
  - The source's sourceType as the type label
  
  Example: If a source has url: "https://mckinsey.com/article" and title: "McKinsey Report", 
  write: - [McKinsey Report](https://mckinsey.com/article) - consulting
  
  Use markdown link format for URLs so they're clickable.`}
- **sources array**: MUST include ALL reputable sources provided above${reputableSourcesAll.length > 0 ? ` (you must include all ${reputableSourcesAll.length} sources listed above)` : " (if any reputable sources were provided)"}
  - Each source in the array should have:
    - url: Full URL
    - title: Publication/Organization name
    - sourceType: Type of source
    - citation: How it was cited in the content (e.g., "Cited as 'McKinsey & Company' in statistics about operational efficiency")
- Fact-check notes for any claims that need verification
${isNonTextContent 
  ? `- Production notes and specifications
- Estimated production time/complexity`
  : `- Word count and reading time estimate`}`;

    const completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(ContentDraftSchema, "content_draft"),
      temperature: 0.3, // Lower temperature for fact-focused content
      max_tokens: 8000, // Cap output to prevent runaway generation
    });

    const result = completion.choices[0].message.parsed;

    if (!result) {
      throw new Error("AI failed to generate content draft");
    }

    // Post-process: Compute wordCount and estimatedReadTime from actual content
    const wordCount = result.content.split(/\s+/).filter(word => word.length > 0).length;
    const estimatedReadTime = Math.max(1, Math.round(wordCount / 200)); // 200 words per minute

    // Override model's wordCount and estimatedReadTime with computed values
    result.wordCount = wordCount;
    result.estimatedReadTime = estimatedReadTime;

    // Ensure sources are included - if AI didn't return them, add them from reputable source metadata
    if (!result.sources || result.sources.length === 0) {
      console.warn("AI did not return sources, adding from reputable source metadata");
      result.sources = reputableSourcesAll.map((s) => ({
        url: s.url,
        title: s.title,
        sourceType: s.sourceType,
        citation: `According to ${s.title}, this source provides context related to ${defaultPainCluster}.`,
      }));
    }

    // Ensure minimum sources match reputable sources provided
    if (reputableSourcesAll.length > 0 && result.sources.length < reputableSourcesAll.length) {
      console.warn(`AI returned ${result.sources.length} sources but ${reputableSourcesAll.length} reputable sources were provided`);
      const returnedUrls = new Set(result.sources.map((s) => s.url));
      const missingSources = reputableSourcesAll.filter((s) => !returnedUrls.has(s.url));
      result.sources.push(
        ...missingSources.map((s) => ({
          url: s.url,
          title: s.title,
          sourceType: s.sourceType,
          citation: `According to ${s.title}, this source provides context related to ${defaultPainCluster}.`,
        }))
      );
    }

    // Deduplicate sources by URL before returning
    result.sources = dedupeSourcesByUrl(result.sources);

    // Fix sources section in content if it contains placeholder URLs
    result.content = fixSourcesSectionInContent(result.content, result.sources);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error generating content draft:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate content draft",
      },
      { status: 500 }
    );
  }
}