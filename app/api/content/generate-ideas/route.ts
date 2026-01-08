import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId, getUserId, getCurrentUserRole } from "@/lib/account-utils";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { searchTrendingTopics } from "@/lib/ai/website-scanner";
import { FunnelStage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Request body validation schema
const GenerateIdeasRequestSchema = z.object({
  gap: z.object({
    icp: z.string().min(1, "ICP is required"), // Keep for backward compatibility
    stage: z.enum(["TOFU_AWARENESS", "MOFU_CONSIDERATION", "BOFU_DECISION", "RETENTION"]),
    painCluster: z.string().nullable().optional(),
    productLineId: z.string().optional(),
    icpTargets: z.array(z.string()).optional(), // Allow multiple ICP targets
  }),
  includeTrendingTopics: z.boolean().optional().default(true),
  mode: z.enum(["trendingOnly", "ideas", "both"]).optional().default("both"),
  selectedSourceIds: z.array(z.string()).optional(), // Selected source IDs when generating ideas
  selectedSources: z.array(z.object({
    id: z.string().optional(),
    url: z.string(),
    title: z.string(),
    content: z.string().optional(),
    relevance: z.string().optional(),
    sourceType: z.string().optional(),
    isReputable: z.boolean().optional(),
    publisher: z.string().nullable().optional(),
    publishedDate: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
  })).optional(), // Full selected source objects when generating ideas (preserves sources for draft generation)
});

// Source schema (matches the structure from TrendingTopicsResult)
const SourceSchema = z.object({
  id: z.string().describe("Stable source identifier (e.g., 'src-sap-com-maint-timeline-0')"),
  url: z.string(),
  title: z.string(),
  publisher: z.string().nullable().optional(),
  publishedDate: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  relevance: z.enum(["high", "medium", "low"]),
  sourceType: z.enum(["consulting", "industry_media", "research", "other"]),
  isReputable: z.boolean(),
  whyReputable: z.string().nullable().optional(),
  whyRelevant: z.string().nullable().optional(),
});

// Schema for content idea (painClusterAddressed will be constrained dynamically)
const createContentIdeaSchema = (allowedPainClusters: string[], availableSourceIds: string[]) => {
  // Ensure we have at least one element for z.enum()
  if (allowedPainClusters.length === 0) {
    throw new Error("At least one pain cluster must be allowed");
  }
  
  return z.object({
    assetType: z.enum([
      "Whitepaper",
      "Case_Study",
      "Blog_Post",
      "Infographic",
      "Webinar_Recording",
      "Sales_Deck",
      "Technical_Doc",
    ]),
    title: z.string().describe("Proposed content title/concept - make it ICP-specific"),
    strategicRationale: z.string().describe("Why this content matters for this gap type and ICP"),
    trendingAngle: z.string().nullable().describe("How to leverage trending topics (if available)"),
    keyMessage: z.string().describe("Core message this content should convey - ICP-native language"),
    painClusterAddressed: z.enum(allowedPainClusters as [string, ...string[]])
      .describe("Which pain cluster this addresses - must be one of the allowed clusters"),
    format: z.string().describe("Content format description"),
    priority: z.enum(["high", "medium", "low"]).describe("Strategic priority"),
    sections: z.array(z.string()).nullable().optional().describe("Specific sections this content will include (e.g., 'timeline exposure (2027/2030), program overrun reality, downtime and business continuity')"),
    sourcesToUse: z.array(z.string())
      .nullable()
      .optional()
      .describe(`Array of source IDs to cite in this content. Must only reference source IDs from the provided sources list. Available IDs: ${availableSourceIds.length > 0 ? availableSourceIds.join(", ") : "none"}`),
    citationMap: z.array(z.object({
      claim: z.string().describe("A specific claim or statement that needs citation"),
      sourceIds: z.array(z.string()).min(1).describe("Source IDs that support this claim (must reference IDs from sourcesToUse)"),
    })).nullable().optional().describe("Map of key claims to their supporting source IDs. Each idea should have 2-4 citation mappings."),
  });
};

// Response schema factory - creates schema with dynamic pain cluster constraint
const createContentIdeasResponseSchema = (allowedPainClusters: string[], availableSourceIds: string[]) => z.object({
  gap: z.object({
    icp: z.string(),
    stage: z.string(),
    painCluster: z.string().nullable(),
  }),
  strategicPriority: z.enum(["high", "medium", "low"]),
  priorityRationale: z.string(),
  trendingContext: z.string().nullable(),
  trendingTopics: z.array(z.string()).nullable(),
  sources: z.array(SourceSchema).min(3).max(5).describe("List of sources with IDs that ideas can reference"),
  ideas: z.array(createContentIdeaSchema(allowedPainClusters, availableSourceIds)).min(3).max(5),
  selectionGuidance: z.string().nullable().optional().describe("Which idea to pick first and why (e.g., 'Pick first: Idea #1 because it's the cleanest awareness asset and naturally tees up later MOFU content')"),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get account ID (this will throw if no account is selected)
    let accountId: string;
    try {
      accountId = await requireAccountId(request);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No account selected. Please select an account first." },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = GenerateIdeasRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed",
          details: validationResult.error.issues
        },
        { status: 400 }
      );
    }

    const { gap, includeTrendingTopics, mode = "both", selectedSourceIds, selectedSources } = validationResult.data;

    // Fetch brand context
    const brandContext = await prisma.brandContext.findUnique({
      where: { accountId },
      include: {
        productLines: true,
      },
    });

    if (!brandContext) {
      return NextResponse.json(
        { error: "Brand context not found. Please set up your brand identity first." },
        { status: 404 }
      );
    }

    // Determine which ICPs to use - prefer icpTargets array, fallback to gap.icp
    const icpTargets = gap.icpTargets && gap.icpTargets.length > 0 ? gap.icpTargets : [gap.icp];
    const primaryICP = icpTargets[0] || gap.icp;

    // Fetch product line if specified
    let productLine = null;
    if (gap.productLineId) {
      productLine = brandContext.productLines.find(pl => pl.id === gap.productLineId);
      if (!productLine) {
        return NextResponse.json(
          { error: "Product line not found" },
          { status: 404 }
        );
      }
    }

    // Fetch existing assets for context - check if any ICP matches
    const existingAssets = await prisma.asset.findMany({
      where: {
        accountId,
        OR: icpTargets.map(icp => ({
          icpTargets: { has: icp },
        })),
        funnelStage: gap.stage, // Now properly validated as FunnelStage enum
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });

    // Count assets in this specific gap to determine gap type
    const assetsInThisGap = await prisma.asset.findMany({
      where: {
        accountId,
        OR: icpTargets.map(icp => ({
          icpTargets: { has: icp },
        })),
        funnelStage: gap.stage,
        ...(gap.painCluster ? {
          painClusters: { has: gap.painCluster },
        } : {}),
      },
    });
    const gapAssetCount = assetsInThisGap.length;

    // Check if user is admin/owner for API warnings
    const userRole = await getCurrentUserRole(request);
    const isAdmin = userRole === "OWNER" || userRole === "ADMIN";

    // Discover trending topics if requested
    // Build search query prioritizing pain clusters and brand identity
    // Use safe fallbacks for array access
    const primaryPainCluster = gap.painCluster ?? brandContext.painClusters[0] ?? null;
    const primaryIndustry = brandContext.targetIndustries[0] ?? null;
    
    let trendingData: {
      trendingTopics: string[];
      results: Array<any>;
      insights: string;
      sourcesUsed: string[];
      _apiWarnings?: Array<{ type: string; message: string; api: string }>;
    } | null = null;
    const apiWarnings: Array<{ type: string; message: string; api: string }> = [];
    
    if (includeTrendingTopics) {
      try {
        // Build search query using ALL brand identity fields for maximum specificity
        // CRITICAL: DO NOT include company-specific terms (product names, company names, domains)
        // Priority: Pain clusters > Use cases > Industry > Generic domain terms > ICP context
        const queryTerms: string[] = [];
        
        // Extract company-specific terms to exclude from search query
        const companyTerms: string[] = [];
        if (brandContext.websiteUrl) {
          try {
            const urlObj = new URL(brandContext.websiteUrl);
            const domain = urlObj.hostname.replace(/^www\./, '').split('.')[0]; // e.g., "leapgreat" from "leapgreat.com"
            companyTerms.push(domain.toLowerCase());
          } catch (e) {
            // If URL parsing fails, try to extract manually
            const match = brandContext.websiteUrl.match(/https?:\/\/(?:www\.)?([^\/]+)/);
            if (match) {
              const domain = match[1].split('.')[0].toLowerCase();
              companyTerms.push(domain);
            }
          }
        }
        if (productLine?.name) {
          companyTerms.push(productLine.name.toLowerCase());
          // Also extract product name variations (remove trademarks, special chars)
          const productNameVariations = productLine.name
            .replace(/[™®©]/g, '')
            .split(/[\s\-]+/)
            .map(term => term.toLowerCase())
            .filter(term => term.length > 2);
          companyTerms.push(...productNameVariations);
        }
        console.log(`[Generate Ideas] Company-specific terms to exclude from search: ${companyTerms.join(", ")}`);
        
        // 1. Primary pain cluster (CRITICAL - most important for finding relevant external sources)
        // DO NOT include product line name - it's too company-specific and will bias results
        if (primaryPainCluster) {
          queryTerms.push(primaryPainCluster);
        }
        
        // 2. Product line value prop - extract GENERIC domain terms (NOT the product name itself)
        if (productLine && productLine.valueProposition) {
          // Extract key technical/domain terms from value prop (exclude product name and company terms)
          const vpTerms = productLine.valueProposition
            .split(/[\s,\-\(\)]+/)
            .filter(word => word.length >= 4 && word.length <= 15)
            .filter(word => {
              const wordLower = word.toLowerCase();
              // Exclude common words, company terms, and product name
              return !['with', 'that', 'this', 'from', 'your', 'their', 'which', 'these', 'those', 'about', 'for', 'and', 'the', 'solutions', 'platform', 'system'].includes(wordLower)
                && !companyTerms.some(ct => wordLower.includes(ct) || ct.includes(wordLower));
            })
            .slice(0, 3); // Get more terms since we're not using product name
          queryTerms.push(...vpTerms);
        }
        
        // 3. Use cases (specific implementation contexts) - EXCLUDE company-specific terms
        if (brandContext.useCases && brandContext.useCases.length > 0) {
          const topUseCase = brandContext.useCases[0];
          // Extract domain-specific terms (avoid generic words and company-specific terms)
          const useCaseTerms = topUseCase
            .split(/[\s,\-\(\)]+/)
            .filter(word => word.length >= 5 && word.length <= 20)
            .filter(word => {
              const wordLower = word.toLowerCase();
              return !['management', 'solutions', 'services', 'platform', 'system', 'software', 'enterprise'].includes(wordLower)
                && !companyTerms.some(ct => wordLower.includes(ct) || ct.includes(wordLower));
            })
            .slice(0, 2);
          if (useCaseTerms.length > 0) {
            queryTerms.push(...useCaseTerms);
          }
        }
        
        // 4. Key differentiators (unique value terms) - EXCLUDE company-specific terms
        if (brandContext.keyDifferentiators && brandContext.keyDifferentiators.length > 0) {
          const topDiff = brandContext.keyDifferentiators[0];
          const diffTerms = topDiff
            .split(/[\s,\-\(\)]+/)
            .filter(word => word.length >= 4 && word.length <= 15)
            .filter(word => {
              const wordLower = word.toLowerCase();
              return !['powered', 'grade', 'interface', 'advanced', 'modern', 'enterprise'].includes(wordLower)
                && !companyTerms.some(ct => wordLower.includes(ct) || ct.includes(wordLower));
            })
            .slice(0, 1);
          if (diffTerms.length > 0) {
            queryTerms.push(...diffTerms);
          }
        }
        
        // 5. Value proposition (extract key domain terms) - EXCLUDE company-specific terms
        if (brandContext.valueProposition) {
          const vpTerms = brandContext.valueProposition
            .split(/[\s,\-\(\)]+/)
            .filter(word => word.length >= 5 && word.length <= 18)
            .filter(word => {
              const wordLower = word.toLowerCase();
              return !['the', 'and', 'for', 'with', 'that', 'this', 'your', 'their', 'provides', 'enables', 'helps'].includes(wordLower)
                && !companyTerms.some(ct => wordLower.includes(ct) || ct.includes(wordLower));
            })
            .slice(0, 2);
          if (vpTerms.length > 0) {
            queryTerms.push(...vpTerms);
          }
        }
        
        // 6. Industry (fallback if we need more terms)
        if (primaryIndustry && queryTerms.length < 5) {
          queryTerms.push(primaryIndustry);
        }
        
        // 7. ICP context (for persona-specific searches)
        if (primaryICP && queryTerms.length < 6) {
          // Extract role acronym if available
          const icpMatch = primaryICP.match(/\(([A-Z]+)\)/);
          if (icpMatch) {
            queryTerms.push(icpMatch[1]);
          }
        }
        
        // Build final query - limit to most relevant terms (max 8 terms for focused search)
        const searchQuery = queryTerms.slice(0, 8).join(" ");

        console.log(`[Generate Ideas] Searching trending topics with query: "${searchQuery}"`);
        console.log(`[Generate Ideas] Primary pain cluster: ${primaryPainCluster}`);
        console.log(`[Generate Ideas] Primary industry: ${primaryIndustry}`);
        console.log(`[Generate Ideas] Product line: ${productLine?.name || 'None'}`);
        console.log(`[Generate Ideas] ICP targets: ${icpTargets.join(", ")}`);

        // Only search if we have meaningful context
        if (primaryPainCluster || primaryIndustry) {
          // Pass COMPLETE brand identity for comprehensive context
          trendingData = await searchTrendingTopics(searchQuery, {
            icp: primaryICP, // Use primary ICP for search (first ICP if multiple)
            painCluster: primaryPainCluster || undefined,
            funnelStage: gap.stage,
            industry: primaryIndustry || undefined,
            // Complete brand identity context
            brandVoice: brandContext.brandVoice.length > 0 ? brandContext.brandVoice.join(", ") : undefined,
            primaryICPRoles: brandContext.primaryICPRoles.length > 0 ? brandContext.primaryICPRoles : undefined,
            targetIndustries: brandContext.targetIndustries.length > 0 ? brandContext.targetIndustries : undefined,
            valueProposition: brandContext.valueProposition || undefined,
            roiClaims: brandContext.roiClaims.length > 0 ? brandContext.roiClaims : undefined,
            keyDifferentiators: brandContext.keyDifferentiators.length > 0 ? brandContext.keyDifferentiators : undefined,
            useCases: brandContext.useCases.length > 0 ? brandContext.useCases : undefined,
            painClusters: brandContext.painClusters.length > 0 ? brandContext.painClusters : undefined, // All pain clusters
            competitors: brandContext.competitors.length > 0 ? brandContext.competitors : undefined,
            websiteUrl: brandContext.websiteUrl || undefined, // Company's own website to exclude
            // Product line context if available
            productLineName: productLine?.name || undefined,
            productLineDescription: productLine?.description || undefined,
            productLineValueProp: productLine?.valueProposition || undefined,
            productLineICPs: productLine?.specificICP && productLine.specificICP.length > 0 ? productLine.specificICP : undefined,
          });
          
          console.log(`[Generate Ideas] Trending data received:`);
          console.log(`[Generate Ideas] - Topics: ${trendingData?.trendingTopics?.length || 0}`);
          console.log(`[Generate Ideas] - Sources: ${trendingData?.results?.length || 0}`);
          console.log(`[Generate Ideas] - Reputable sources: ${trendingData?.results?.filter((r: any) => r.isReputable)?.length || 0}`);
          
          // Collect API warnings (only for admin display)
          if (isAdmin && trendingData?._apiWarnings) {
            apiWarnings.push(...trendingData._apiWarnings);
          }
        } else {
          console.warn(`[Generate Ideas] Skipping Jina search - no pain cluster or industry context`);
        }
      } catch (error) {
        console.error("[Generate Ideas] ERROR discovering trending topics:", error);
        console.error("[Generate Ideas] Error details:", error instanceof Error ? error.message : String(error));
        // Continue without trending topics - set to empty structure
        trendingData = {
          trendingTopics: [],
          results: [],
          insights: error instanceof Error ? `Trending topics discovery failed: ${error.message}` : "Trending topics discovery unavailable.",
          sourcesUsed: [],
        };
      }
    } else {
      console.log(`[Generate Ideas] Trending topics discovery skipped (includeTrendingTopics: false)`);
      trendingData = {
        trendingTopics: [],
        results: [],
        insights: "Trending topics discovery was skipped.",
        sourcesUsed: [],
      };
    }

    // Ensure trendingData is never null - initialize with empty structure if still null
    if (!trendingData) {
      trendingData = {
        trendingTopics: [],
        results: [],
        insights: "Trending topics discovery unavailable.",
        sourcesUsed: [],
      };
    }

    // Build brand context string
    const brandVoiceText = brandContext.brandVoice.length > 0
      ? brandContext.brandVoice.join(", ")
      : "Professional, Customer-Centric";

    // Build product line context if specified
    const productLineContext = productLine
      ? `
PRODUCT LINE CONTEXT (THIS IS THE SPECIFIC PRODUCT THIS CONTENT IS FOR):
- Product Line Name: ${productLine.name}
- Description: ${productLine.description}
- Value Proposition: ${productLine.valueProposition}
- Target ICPs: ${productLine.specificICP.join(", ")}
`
      : "";

    const brandContextText = `
🔴 COMPLETE BRAND IDENTITY (YOU MUST USE ALL OF THIS):
BRAND IDENTITY:
- Brand Voice: ${brandVoiceText}
- Primary ICP Roles: ${brandContext.primaryICPRoles.join(", ") || "Not specified"}
- Target Industries: ${brandContext.targetIndustries.join(", ") || "Not specified"}
- Pain Clusters: ${brandContext.painClusters.join(", ") || "Not specified"}
- Value Proposition: ${brandContext.valueProposition || "Not specified"}
- ROI Claims: ${brandContext.roiClaims.join(", ") || "Not specified"}
- Key Differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Use Cases: ${brandContext.useCases.join(", ") || "Not specified"}
- Competitors (EXCLUDE): ${brandContext.competitors.join(", ") || "None specified"}
${productLineContext}

🔴 CRITICAL: USE ALL BRAND IDENTITY FACTORS
When generating content ideas, you MUST consider ALL of the above brand identity information:
1. **Target Industries**: Ideas must be relevant to ${brandContext.targetIndustries.join(", ") || "the company's target industries"}
2. **Brand Voice**: Ideas must match the ${brandVoiceText} tone
3. **Primary ICP Roles**: Ideas must resonate with ${brandContext.primaryICPRoles.join(", ") || "the target ICP roles"}
4. **Pain Clusters**: Ideas MUST solve ${brandContext.painClusters.join(", ") || "the identified pain clusters"}
5. **Value Proposition**: Ideas must align with "${brandContext.valueProposition || "the company's value proposition"}"
6. **ROI Claims**: Reference ${brandContext.roiClaims.join(", ") || "ROI claims"} where relevant
7. **Key Differentiators**: Leverage ${brandContext.keyDifferentiators.join(", ") || "differentiators"} to stand out
8. **Use Cases**: Connect to ${brandContext.useCases.join(", ") || "use cases"} where applicable
${productLine ? `9. **Product Line**: ${productLine.name} - Use product line context above` : ""}

Do NOT generate generic ideas that could apply to any company. Ideas must show deep understanding of ALL brand identity factors.
`;

    const trendingContextText = trendingData && trendingData.trendingTopics && trendingData.trendingTopics.length > 0
      ? `
TRENDING TOPICS DISCOVERY:
- Trending Topics: ${trendingData.trendingTopics.join(", ")}
- Strategic Insights: ${trendingData.insights || "No insights available"}
- Top Articles Found: ${trendingData.results?.length || 0} relevant sources
`
      : "";

    const existingAssetsText = existingAssets.length > 0
      ? `
EXISTING CONTENT CONTEXT:
- Similar assets we have: ${existingAssets.map(a => a.title).join(", ")}
- What's missing: Content that adds unique value beyond existing assets
`
      : "";

    // Calculate date cutoff (8 months ago from today) for system prompt
    const today = new Date();
    const eightMonthsAgo = new Date(today);
    eightMonthsAgo.setMonth(today.getMonth() - 8);
    const cutoffDateStr = eightMonthsAgo.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `You are a Senior B2B Content Strategist analyzing content gaps with strategic context.

🔴 STRATEGIC GAP ANALYSIS (CRITICAL FIRST STEP):
Before generating ideas, you MUST analyze the gap strategically:

1. **Gap Type Identification**:
   - If this is TOFU stage with 0 assets: This is an AWARENESS gap
     → Content should NOT be "how to execute" or technical implementation
     → Content should help the ICP understand: "What is the financial/business exposure if we keep the status quo?"
     → Content should answer: "What decisions do I need to force now to avoid an ugly surprise later?"
   - If this is MOFU stage: This is a CONSIDERATION gap
     → Content should help evaluate solutions and compare options
   - If this is BOFU stage: This is a DECISION gap
     → Content should help make the final decision and justify the investment

2. **ICP-Specific Content Requirements**:
   - For CFO: Focus on financial exposure, risk, cost implications, ROI, business continuity
   - For CTO/VP Engineering: Focus on technical feasibility, architecture, implementation
   - For other ICPs: Adjust language and focus accordingly
   - Content must be written in the ICP's native language (CFO = finance terms, not technical jargon)

3. **Content Type Selection**:
   - TOFU gaps need awareness content (explainers, risk maps, decision frameworks)
   - MOFU gaps need consideration content (comparisons, case studies, ROI calculators)
   - BOFU gaps need decision content (implementation guides, vendor comparisons)

Your goal is to generate 3-5 high-quality content ideas that:
1. **PRIMARY FOCUS: Solve the specific pain cluster(s)** - Each idea MUST directly address and solve the pain cluster(s) identified
2. **MATCH THE GAP TYPE**: If TOFU with 0 assets, generate AWARENESS content, not execution content
3. **BE ICP-NATIVE**: Use language and framing appropriate for the target ICP (e.g., CFO = financial terms, not technical)
4. **INCLUDE SPECIFIC SECTIONS**: Each idea should list the specific sections it will include
5. **REFERENCE SOURCES**: Each idea should specify which sources from trending discovery to use
6. **FILL THE GAP STRATEGICALLY**: Content should naturally tee up later-stage content (if TOFU, should lead to MOFU)
7. **USE ALL BRAND IDENTITY FACTORS** - Every idea must show understanding of ALL brand identity information (target industries, brand voice, ICP roles, value proposition, ROI claims, differentiators, use cases)
8. Incorporate trending topics (if available) to ensure relevance and timeliness
9. Align with the brand voice and leverage brand differentiators
10. Reference value proposition, use cases, and ROI claims where relevant
11. Be relevant to the company's target industries and business context
12. Follow B2B content best practices (specific, data-driven, problem-focused)
13. **Ensure all content references are current** - No dates older than ${cutoffDateStr} (8 months before today: ${todayStr})

🔴 CRITICAL: Every content idea MUST solve the pain cluster(s). The pain cluster is the core problem your organization solves - the content must demonstrate HOW to solve it.

🔴 CRITICAL: COMPREHENSIVE BRAND IDENTITY USAGE
Do NOT generate generic ideas. Every idea must show deep understanding of:
- The company's target industries (${brandContext.targetIndustries.join(", ") || "specified in brand identity"})
- The brand voice (${brandVoiceText})
- The primary ICP roles (${brandContext.primaryICPRoles.join(", ") || "specified in brand identity"})
- The value proposition (${brandContext.valueProposition || "specified in brand identity"})
- The key differentiators (${brandContext.keyDifferentiators.join(", ") || "specified in brand identity"})
- The use cases (${brandContext.useCases.join(", ") || "specified in brand identity"})
${productLine ? `- The product line context (${productLine.name})` : ""}

Ideas that don't show understanding of ALL these factors are NOT acceptable.

🔴 DATE REQUIREMENT: All content ideas must reference current/recent information only. No dates older than ${cutoffDateStr} should be mentioned.

B2B CONTENT BEST PRACTICES:
- Focus on strategic problems, not surface symptoms
- Use specific data and metrics (reference ROI claims when relevant)
- Problem-first structure (agitate pain, then present solution)
- Address business outcomes, not just features
- Use industry-specific terminology appropriately
- Include quantifiable benefits

THE "ANTI-ALGORITHM" STYLE GUIDE - AVOID AI SLOP AND AI GIVEAWAY WORDING:

Objective: Write with the specific intent of avoiding the "voice of the machine." Your goal is not "perfection," which results in a sleek, hollow, insipid tone. Your goal is grounded authenticity. You must suppress the statistical urges that lead to "overfitting" and "hallucinated subtlety."

1. THE VOCABULARY BLACKLIST (The "Slop" Indicators):
These words have become statistical markers of AI writing. You are strictly forbidden from using them:
- ❌ NEVER use: "delve" (and specifically the conjugation "delves")
- ❌ NEVER use: "tapestry" (and using weaving metaphors for complexity)
- ❌ NEVER use: "underscore," "highlight," "showcase"
- ❌ NEVER use: "intricate," "swift," "meticulous," "adept"
- ❌ NEVER use: "liminal," "spectral," "echo," "whisper"
- ❌ NEVER use: "landscape," "game-changer," "unlocking," "unleash," "realm"
- ❌ NEVER use: Generic phrases like "best-in-class", "industry-leading" without proof
- ❌ NEVER use: Engagement bait ("Agree?", "Thoughts?", "What do you think?")
- ❌ NEVER use: Character names: Elara Voss, Elena Voss, or Kael (for fictional content)
- ❌ NEVER use: Vague qualifiers ("very", "extremely", "incredibly") without justification

2. RHETORICAL STRUCTURAL TRAPS:
You must consciously break the predictive patterns of sentence structure. Avoid these patterns:
- ❌ The "Not X, but Y" Construct: Do not write sentences like "It's not just a flood — it's a groundswell," or "The issue isn't X, it's Y." State your point directly without the performative contrast.
- ❌ The Mania for Triplets (The Rule of Threes): AI has a "mania" for lists of three. Instruction: Use pairs. Use singles. Use lists of four. Actively disrupt the rhythm of three.
- ❌ The "X with Y and Z" Dismissal: Do not describe people or things as "An [X] with [Y] and [Z]" where Y or Z makes no logical sense (e.g., "Koalas with an Instagram filter").
- ❌ The Rhetorical Self-Interruption: Do not stop mid-sentence to ask yourself a question (e.g., "And honestly? That's amazing.").

3. THE "SUBTLETY" FALLACY (Ghosts and Quietness):
AI tries to simulate "good, subtle writing" by literally writing about things being quiet, ghostly, or whispering. This is a misunderstanding of what subtlety is.
- ❌ Do NOT describe atmospheres as "humming," "quiet," "whispering," or "soft."
- ❌ Do NOT use "ghosts," "phantoms," or "shadows" as metaphors for memory or past events.
- ✅ Subtlety is achieved by what you don't say, not by using the word "quiet" ten times.

4. SENSORY GROUNDING VS. ABSTRACT HALLUCINATION:
Because AI cannot experience the world, it attaches sensory words to abstract concepts (e.g., "turpentine and dreams," "grief tastes of metal"). This creates "mixed metaphors and empty sincerity."
- ❌ The "Virginia Woolf" Standard: When using sensory language (sight, sound, taste), apply it ONLY to physical objects.
  - Bad (AI): "The day tasted of almost-Friday." (Abstract)
  - Good (Human): "The great plateful of blue water." (Concrete)
- ❌ Avoid "Empty Sincerity": Do not use corporate-emotional speak like "woven into your daily rhythm" or "unfolding the brushstrokes of regret." If the emotion isn't attached to a specific, concrete action or object, delete it.

5. PUNCTUATION AND TONE:
- ❌ The Em Dash (—): The em dash is identified as a "sign of zero-effort... slop." Limit your use of em dashes. Do not use them to create a "dramatic pause." Use standard commas, periods, or semicolons.
- ❌ Cultural Specificity: Do not "smuggle" cultural practices where they don't belong (e.g., Do not make a British speaker say "I rise to speak," which is an Americanism). Ensure your register matches the specific speaker, not a generalized "internet average."
- ❌ Avoid Hysteria: AI tone is described as "slightly wide-eyed, overeager... on the verge of some kind of hysteria." Lower the temperature. Be detached. Be boring if necessary. Do not be "helpful, informative, and engaging." Be real.

SUMMARY:
To write like a human, you must be willing to be asymmetric, occasionally flat, and grounded in physical reality. You must reject the algorithm's urge to "weave tapestries," "delve into topics," or create "quiet echoes." Write with the specific, messy reality of a being that has physically stood in a room, not a code that has statistically analyzed the concept of a room.

✅ DO use: Specific metrics, percentages, timeframes
✅ DO use: Concrete examples with context
✅ DO use: Problem-first structure
✅ DO use: Clear, direct language
✅ DO use: Industry-specific terminology when appropriate

🔴 STRICT WRITING GUIDELINES (MANDATORY):

Follow these strict guidelines for all content:

1. **Tone & Style:**
   - Use concise, direct language. Favor clarity over flourish.
   - Avoid motivational filler, metaphors, and figurative language.
   - Prioritize action-oriented, cause-and-effect statements.
   - Maintain a professional, practical tone throughout. Avoid marketing hype.

2. **Structure:**
   - Begin each section with an immediately relevant statement. Skip thematic or philosophical intros.
   - Use short paragraphs (2–5 sentences).
   - Avoid bulleted lists unless absolutely necessary. Use structured prose.
   - Vary sentence structure to avoid repetition and maintain flow.

3. **Language Constraints:**
   - Do not use or imply metaphors, symbolism, or imagery.
   - **Prohibited words and phrases include:**
     * "Unlock," "empower," "transform," "journey," "navigate," "explore," "embrace"
     * "Cutting-edge," "dynamic," "realm," "landscape," "holistic," "game-changer," "future-ready"
     * Similar abstractions and marketing buzzwords
   - Avoid motivational phrases like "more than ever," "step into," or "a testament to."
   - Never use constructions like "not just X, but Y."
   - Avoid overused setups such as "In today's world…" or "It's essential to…"

4. **Content Approach:**
   - Stick to functional, factual, objective descriptions.
   - Focus on practical processes, decision points, risks, and outcomes.
   - If citing benefits or statistics, be specific and quantifiable.
   - All examples and scenarios should reflect realistic professional situations.

5. **Voice:**
   - Write as if explaining to an experienced peer—not selling to a prospect.
   - Keep the tone grounded, confident, and informed.
   - No fluff, no filler.

${brandContextText}
${trendingContextText}
${existingAssetsText}`;

    // Determine which pain clusters to address (with safe fallbacks)
    const painClustersToAddress = gap.painCluster 
      ? [gap.painCluster, ...brandContext.painClusters.filter(pc => pc !== gap.painCluster).slice(0, 1)]
      : brandContext.painClusters.length > 0
      ? brandContext.painClusters.slice(0, 2)
      : [];

    // Build allowed pain clusters for validation (must include at least one)
    const allowedPainClusters = painClustersToAddress.length > 0
      ? painClustersToAddress
      : primaryPainCluster
      ? [primaryPainCluster]
      : brandContext.painClusters.length > 0
      ? brandContext.painClusters
      : ["General Business Challenges"]; // Fallback if no pain clusters defined

    // Extract source IDs from trending data (if available)
    // CRITICAL: If selectedSources (full objects) are provided, use those directly
    // Otherwise, filter trendingData.results based on selectedSourceIds
    let availableSources = trendingData?.results || [];
    if (mode === "ideas" && selectedSources && selectedSources.length > 0) {
      // Use the full source objects provided by the client (most reliable)
      availableSources = selectedSources;
      console.log(`[Generate Ideas] Using ${availableSources.length} selected source objects provided by client`);
    } else if (mode === "ideas" && selectedSourceIds && selectedSourceIds.length > 0) {
      // Fallback: Filter sources from trendingData based on selected IDs
      availableSources = (trendingData?.results || []).filter((s: any) => {
        const sourceId = s.id || `src-${s.url}`;
        return selectedSourceIds.includes(sourceId) || selectedSourceIds.includes(s.url);
      });
      console.log(`[Generate Ideas] Filtered to ${availableSources.length} selected sources from ${trendingData?.results?.length || 0} total`);
    }
    
    const availableSourceIds = availableSources.map((s: any) => s.id || `src-${s.url}`).filter(Boolean);
    
    // If mode is "trendingOnly", return early with just trending topics and sources
    if (mode === "trendingOnly") {
      const sourcesArray = (trendingData?.results || []).map((r: any) => ({
        id: r.id || `src-${r.url}`,
        url: r.url,
        title: r.title,
        publisher: r.publisher || null,
        publishedDate: r.publishedDate || null,
        excerpt: r.excerpt ? (r.excerpt.length > 500 ? r.excerpt.substring(0, 500) + "..." : r.excerpt) : null,
        relevance: r.relevance || "medium",
        sourceType: r.sourceType || "other",
        isReputable: r.isReputable || false,
        whyReputable: r.whyReputable || null,
        whyRelevant: r.whyRelevant || null,
      }));
      
      return NextResponse.json({
        gap: {
          icp: gap.icp,
          stage: gap.stage,
          painCluster: gap.painCluster || null,
        },
        strategicPriority: "medium" as const,
        priorityRationale: "Trending discovery mode - ideas not generated",
        trendingContext: trendingData?.insights || null,
        trendingTopics: trendingData?.trendingTopics || [],
        sources: sourcesArray,
        ideas: [], // No ideas in trendingOnly mode
        trendingSources: (trendingData?.results || []).map((r: any) => ({
          id: r.id || `src-${r.url}`,
          url: r.url,
          title: r.title,
          content: r.content ? (r.content.length > 800 ? r.content.substring(0, 800) + "..." : r.content) : "",
          relevance: r.relevance,
          sourceType: r.sourceType,
          isReputable: r.isReputable,
        })),
        trendingInsights: trendingData?.insights || "",
        sourceCountWarning: (trendingData as any)?.sourceCountWarning || undefined,
        _apiWarnings: isAdmin && apiWarnings.length > 0 ? apiWarnings : undefined,
      });
    }
    
    // Create dynamic schemas with constrained pain clusters and available source IDs
    const ContentIdeasResponseSchema = createContentIdeasResponseSchema(allowedPainClusters, availableSourceIds);

    // Build user prompt with safe fallbacks
    const primaryPainClusterDisplay = gap.painCluster || primaryPainCluster || "the identified pain cluster";

    // Determine which ICPs to use for the prompt
    const icpTargetsForPrompt = gap.icpTargets && gap.icpTargets.length > 0 ? gap.icpTargets : [gap.icp];
    const icpDisplayText = icpTargetsForPrompt.length > 1 
      ? `${icpTargetsForPrompt.join(", ")} (${icpTargetsForPrompt.length} ICPs)`
      : icpTargetsForPrompt[0];

    // Build gap analysis context
    const gapType = gapAssetCount === 0 
      ? (gap.stage === "TOFU_AWARENESS" ? "AWARENESS gap (0 assets)" : gap.stage === "MOFU_CONSIDERATION" ? "CONSIDERATION gap (0 assets)" : "DECISION gap (0 assets)")
      : `${gapAssetCount} existing asset(s)`;
    
    // Determine if this is a CFO TOFU awareness gap
    const isCFO_TOFU_Awareness = gapAssetCount === 0 && 
                                  gap.stage === "TOFU_AWARENESS" && 
                                  (icpDisplayText.includes("CFO") || icpDisplayText.includes("Chief Financial Officer"));
    
    const gapTypeGuidance = gapAssetCount === 0 && gap.stage === "TOFU_AWARENESS"
      ? isCFO_TOFU_Awareness
        ? "This is a pure CFO AWARENESS gap (0 assets). Content MUST be finance-native and non-technical. Focus on: risk exposure, timelines (2027/2030), budget shock, business continuity, governance and decision gates, hidden cost categories. Content should NOT be 'how to execute a conversion.' It should help the CFO understand financial/business exposure and what decisions to force now. Asset types MUST be Blog_Post, Infographic, or Whitepaper only (NO Technical_Doc)."
        : "This is a pure AWARENESS gap. Content should NOT be 'how to execute a conversion.' It should help the ICP understand financial/business exposure and what decisions to force now."
      : gapAssetCount === 0 && gap.stage === "MOFU_CONSIDERATION"
      ? "This is a CONSIDERATION gap. Content should help evaluate solutions and compare options."
      : gapAssetCount === 0 && gap.stage === "BOFU_DECISION"
      ? "This is a DECISION gap. Content should help make the final decision and justify the investment."
      : "Content should add unique value beyond existing assets.";

    // Build ICP-specific language guidance
    const icpLanguageGuidance = icpDisplayText.includes("CFO") || icpDisplayText.includes("Chief Financial Officer")
      ? "Use financial terms, risk language, cost implications, ROI, business continuity. Avoid technical jargon."
      : icpDisplayText.includes("CTO") || icpDisplayText.includes("VP Engineering") || icpDisplayText.includes("Chief Technology Officer")
      ? "Use technical terminology, architecture language, implementation details."
      : "Use language appropriate for this ICP role.";

    // Helper to extract domain from URL
    const extractDomainFromUrl = (url: string): string => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, "");
      } catch {
        const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
        return match ? match[1] : url;
      }
    };

    // Build sources list for reference with IDs (use filtered availableSources if selectedSourceIds provided)
    const sourcesToShow = mode === "ideas" && selectedSourceIds && selectedSourceIds.length > 0
      ? availableSources
      : (trendingData?.results || []);
      
    const sourcesList = sourcesToShow && sourcesToShow.length > 0
      ? sourcesToShow.slice(0, 5).map((source: any, i: number) => {
          const sourceId = source.id || `src-${source.url}`;
          return `  ${i + 1}. [ID: ${sourceId}] ${source.title} (${source.url})
     - Publisher: ${source.publisher || extractDomainFromUrl(source.url) || "Unknown"}
     - Published: ${source.publishedDate || "Date not available"}
     - Relevance: ${source.relevance}
     - Source type: ${source.sourceType || "other"}
     - Reputable: ${source.isReputable ? "Yes" : "No"}
     - Why Reputable: ${source.whyReputable || "Not specified"}
     - Why Relevant: ${source.whyRelevant || "Not specified"}
     - Excerpt: ${source.excerpt ? source.excerpt.substring(0, 200) + "..." : "No excerpt"}`
        }).join("\n\n")
      : "";

    const userPrompt = `Analyze this gap strategically, then generate content ideas:

GAP ANALYSIS:
- ICP: ${icpDisplayText}
- Funnel Stage: ${gap.stage}
- Primary Pain Cluster: ${primaryPainClusterDisplay}
- Current Assets in This Gap: ${gapAssetCount} (${gapType})

🔴 STRATEGIC INSIGHT REQUIRED:
${gapTypeGuidance}

${sourcesList
  ? `AVAILABLE SOURCES WITH IDs (You MUST reference these by ID in your ideas):
${sourcesList}

🔴 CRITICAL: When referencing sources in your ideas:
1. Use ONLY the source IDs provided above (e.g., "src-sap-com-maint-timeline-0", NOT "SAP maintenance timeline")
2. In "sourcesToUse", list the source IDs as an array of strings (e.g., ["src-sap-com-maint-timeline-0", "src-kyndryl-com-overrun-1"])
3. In "citationMap", map each claim to the source IDs that support it:
   - claim: "SAP states mainstream maintenance runs to end of 2027"
   - sourceIds: ["src-sap-com-maint-timeline-0"]
4. Every trending topic and every idea claim must be traceable to at least one source ID
5. Do NOT invent source IDs or use free-text references`
  : ""}

${trendingData && trendingData.trendingTopics && trendingData.trendingTopics.length > 0
  ? `TRENDING TOPICS TO INCORPORATE:
${trendingData.trendingTopics.map((topic, i) => `  ${i + 1}. ${topic}`).join("\n")}

Frame these topics with ICP-specific angles (e.g., for CFO: "The migration decision is no longer a tech roadmap issue. It is a predictable cost and risk exposure with a date attached.")`
  : ""}

🔴 CRITICAL REQUIREMENTS:
1. **Match the gap type**: ${gap.stage === "TOFU_AWARENESS" ? "Generate AWARENESS-focused content" : gap.stage === "MOFU_CONSIDERATION" ? "Generate CONSIDERATION-focused content" : "Generate DECISION-focused content"}
2. **Be ${icpDisplayText}-native**: ${icpLanguageGuidance}
3. **Include specific sections**: List exact sections for each idea (e.g., "timeline exposure (2027/2030), program overrun reality, downtime and business continuity")
${sourcesList ? "4. **Reference sources**: Specify which sources from above to use in each idea" : "4. **Sources**: No specific sources available - generate ideas based on strategic gap analysis and brand identity"}
5. **Fill the gap strategically**: Content should naturally lead to next-stage content

Every content idea MUST solve the pain cluster(s). The content must:
- Clearly identify the pain cluster as a problem
- Explain the cost/impact of not solving it
- Demonstrate HOW to solve it${productLine ? ` (using ${productLine.name}'s value proposition: ${productLine.valueProposition})` : ` (using our value proposition: ${brandContext.valueProposition || "Not specified"})`}
- Reference our differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Show how our use cases address it: ${brandContext.useCases.join(", ") || "Not specified"}
${productLine ? `- **CRITICAL**: This content is specifically for the "${productLine.name}" product line. Use the product line's value proposition and target ICPs (${productLine.specificICP.join(", ")}) when generating ideas.` : ""}
${icpTargetsForPrompt.length > 1 ? `- **ICP TARGETS**: This content should target ${icpTargetsForPrompt.length} ICP roles: ${icpTargetsForPrompt.join(", ")}. The content should resonate with all these audiences.` : ""}

🔴 DATE REQUIREMENT (CRITICAL):
- Today's date: ${todayStr}
- NO content should reference dates older than ${cutoffDateStr} (8 months before today)
- All statistics, studies, reports, or examples must be from ${cutoffDateStr} or later

REQUIREMENTS:
- Generate 3-5 distinct content ideas
- Each idea must have a different angle/approach to solving the pain cluster(s)
${painClustersToAddress.length > 0
  ? `- **EVERY IDEA MUST SOLVE THE PAIN CLUSTER**: ${painClustersToAddress.join(" or ")}`
  : "- Focus on addressing the core business challenges for this ICP"}
- Prioritize ideas that directly address: ${primaryPainClusterDisplay}
- Ensure ideas are appropriate for ${gap.stage} stage
- Target the ICP(s): ${icpDisplayText}${icpTargetsForPrompt.length > 1 ? ` (content should resonate with all ${icpTargetsForPrompt.length} ICPs)` : ""}
- Leverage brand differentiators: ${brandContext.keyDifferentiators.join(", ") || "Not specified"}
- Reference use cases where relevant: ${brandContext.useCases.join(", ") || "Not specified"}

OUTPUT FORMAT:
For each idea, provide:
- Asset Type: [Type from enum${isCFO_TOFU_Awareness ? " - MUST be Blog_Post, Infographic, or Whitepaper only (NO Technical_Doc)" : ""}]
- Title: [Proposed title/concept - make it ${icpDisplayText}-specific]
- Strategic Rationale: [Why this matters for this gap type and ICP]
${trendingData && trendingData.trendingTopics && trendingData.trendingTopics.length > 0
  ? "- Trending Angle: [How to leverage trending topics with ICP-specific framing]"
  : ""}
- Sections: [List specific sections${isCFO_TOFU_Awareness ? " - MUST include at least one of: timeline exposure, cost overrun risk, business continuity, governance and decision gates, hidden cost categories" : ""}. E.g., "timeline exposure (2027/2030), program overrun reality, downtime and business continuity"]
${sourcesList ? "- Sources to Use: [Array of source IDs from above, e.g., ['src-sap-com-maint-timeline-0', 'src-kyndryl-com-overrun-1'] - MUST reference IDs, NOT free text]" : ""}
${sourcesList ? "- Citation Map: [Array of {claim: string, sourceIds: string[]} objects. Each idea should have 2-4 citation mappings. Example: [{claim: 'SAP states mainstream maintenance runs to end of 2027', sourceIds: ['src-sap-com-maint-timeline-0']}]" : ""}
- Key Message: [Core message - ${icpDisplayText}-native]
- Pain Cluster Addressed: [Must be one of: ${allowedPainClusters.join(", ")}]
- Format: [Content format description]
- Priority: [high/medium/low based on strategic importance]

Also provide:
- Strategic Priority: Overall priority for this gap (high/medium/low)
- Priority Rationale: Why this gap matters and what type of content is needed
${trendingData && trendingData.trendingTopics && trendingData.trendingTopics.length > 0
  ? "- Trending Context: How trending topics relate to this gap"
  : ""}
- Selection Guidance: Which idea to pick first and why (e.g., "Pick first: Idea #1 because it's the cleanest awareness asset and naturally tees up later MOFU content")`;

    let completion;
    try {
      completion = await openai.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: zodResponseFormat(ContentIdeasResponseSchema, "content_ideas"),
      temperature: 0.7,
    });
    } catch (openaiError: any) {
      console.error("[Generate Ideas] OpenAI API error:", openaiError);
      console.error("[Generate Ideas] Error details:", openaiError?.message || String(openaiError));
      throw new Error(`Failed to call OpenAI API: ${openaiError?.message || "Unknown error"}`);
    }

    if (!completion.choices || completion.choices.length === 0) {
      console.error("[Generate Ideas] No choices returned from OpenAI");
      throw new Error("AI did not return any choices");
    }

    const result = completion.choices[0].message.parsed;

    if (!result) {
      // Log the raw response to debug
      console.error("[Generate Ideas] AI failed to parse response");
      console.error("[Generate Ideas] Raw message:", completion.choices[0].message);
      console.error("[Generate Ideas] Refusal reason:", completion.choices[0].message.refusal);
      if (completion.choices[0].message.content) {
        console.error("[Generate Ideas] Unparsed content:", completion.choices[0].message.content);
      }
      throw new Error("AI failed to generate content ideas - response could not be parsed");
    }

    // Validate that all source IDs referenced in ideas actually exist
    const availableSourceIdsSet = new Set(availableSourceIds);
    
    // Ensure sections, sourcesToUse, and citationMap are properly handled (nullable optional fields)
    // OpenAI may return undefined for optional fields, so we need to convert to null
    const ideasWithDefaults = result.ideas.map((idea: any) => {
      // Validate sourcesToUse IDs
      if (idea.sourcesToUse && Array.isArray(idea.sourcesToUse)) {
        const invalidIds = idea.sourcesToUse.filter((id: string) => !availableSourceIdsSet.has(id));
        if (invalidIds.length > 0) {
          console.warn(`[Generate Ideas] Invalid source IDs in idea "${idea.title}": ${invalidIds.join(", ")}`);
          // Filter out invalid IDs
          idea.sourcesToUse = idea.sourcesToUse.filter((id: string) => availableSourceIdsSet.has(id));
        }
      }
      
      // Validate citationMap source IDs
      if (idea.citationMap && Array.isArray(idea.citationMap)) {
        idea.citationMap = idea.citationMap.map((citation: any) => {
          if (citation.sourceIds && Array.isArray(citation.sourceIds)) {
            const invalidIds = citation.sourceIds.filter((id: string) => !availableSourceIdsSet.has(id));
            if (invalidIds.length > 0) {
              console.warn(`[Generate Ideas] Invalid source IDs in citation for idea "${idea.title}": ${invalidIds.join(", ")}`);
              // Filter out invalid IDs
              citation.sourceIds = citation.sourceIds.filter((id: string) => availableSourceIdsSet.has(id));
            }
          }
          return citation;
        }).filter((citation: any) => citation.sourceIds && citation.sourceIds.length > 0);
      }
      
      const processed = {
        ...idea,
        sections: idea.sections !== undefined 
          ? (Array.isArray(idea.sections) && idea.sections.length > 0 ? idea.sections : null)
          : null,
        sourcesToUse: idea.sourcesToUse !== undefined
          ? (Array.isArray(idea.sourcesToUse) && idea.sourcesToUse.length > 0 ? idea.sourcesToUse : null)
          : null,
        citationMap: idea.citationMap !== undefined
          ? (Array.isArray(idea.citationMap) && idea.citationMap.length > 0 ? idea.citationMap : null)
          : null,
      };
      return processed;
    });

    // CRITICAL: Build sources array using availableSources (filtered selected sources) when mode is "ideas"
    // This ensures only selected sources are returned and available for draft generation
    const sourcesToReturn = mode === "ideas" && availableSources.length > 0
      ? availableSources  // Use filtered selected sources
      : (trendingData?.results || result.sources || []);  // Fallback to all sources
    
    const sourcesArray = sourcesToReturn.map((r: any) => ({
      id: r.id || `src-${r.url}`,
      url: r.url,
      title: r.title,
      publisher: r.publisher || null,
      publishedDate: r.publishedDate || null,
      excerpt: r.excerpt ? (r.excerpt.length > 500 ? r.excerpt.substring(0, 500) + "..." : r.excerpt) : null,
      relevance: r.relevance || "medium",
      sourceType: r.sourceType || "other",
      isReputable: r.isReputable || false,
      whyReputable: r.whyReputable || null,
      whyRelevant: r.whyRelevant || null,
    }));

    // Add trending topics data to response
    // Return excerpt only (capped at 800 chars) to avoid sending full content to client
    // CRITICAL: trendingSources must include full content for draft generation
    const response = {
      ...result,
      ideas: ideasWithDefaults,
      sources: sourcesArray,
      trendingTopics: trendingData?.trendingTopics || result.trendingTopics || [],
      trendingInsights: trendingData?.insights || "",
      trendingSources: sourcesToReturn.map((r: any) => ({
        id: r.id || `src-${r.url}`,
        url: r.url,
        title: r.title,
        content: r.content ? (r.content.length > 2000 ? r.content.substring(0, 2000) + "..." : r.content) : (r.excerpt || ""), // Include full content for draft generation (up to 2000 chars)
        relevance: r.relevance || "medium",
        sourceType: r.sourceType || "other",
        isReputable: r.isReputable || false,
        publisher: r.publisher || null,
        publishedDate: r.publishedDate || null,
        excerpt: r.excerpt ? (r.excerpt.length > 500 ? r.excerpt.substring(0, 500) + "..." : r.excerpt) : null,
      })),
      selectionGuidance: result.selectionGuidance || null,
      sourceCountWarning: (trendingData as any)?.sourceCountWarning || undefined,
      _apiWarnings: isAdmin && apiWarnings.length > 0 ? apiWarnings : undefined, // Only include if admin and warnings exist
    };
    
    console.log(`[Generate Ideas] Returning response with ${response.trendingSources.length} sources for draft generation`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error generating content ideas:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate content ideas",
      },
      { status: 500 }
    );
  }
}
