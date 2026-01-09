import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountId } from "@/lib/account-utils";
import { z } from "zod";
import { getStrategicKeywords, KeywordResult, APIWarning } from "@/lib/keywords/dataforseo";
import { Asset, FunnelStage, AssetStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ppcCampaignSchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset ID is required"),
  productLineId: z.string().optional(),
  locationName: z.string().optional(), // Override account default location
  languageName: z.string().optional(), // Override account default language
});

interface SearchIntentResult {
  keyword: string;
  main_intent: "informational" | "commercial" | "transactional" | "navigational";
  // Secondary intents returned by the API (labels only; probabilities are available but not currently used elsewhere)
  foreign_intent?: string[];
  // Probability for the primary intent (1 = highest probability)
  intent_probability?: number;
}

interface AssetMatch {
  assetId: string;
  assetTitle: string;
  score: number; // 0-100
  reasons: string[];
  funnelStage: FunnelStage;
  productLines: string[];
}

interface KeywordWithMatches extends KeywordResult {
  searchIntent?: SearchIntentResult;
  assetMatches: AssetMatch[];
  recommendedAssetId?: string;
  adGroupSuggestion?: string;
  matchType?: "broad" | "phrase" | "exact";
  estimatedMonthlySpend?: number;
}

/**
 * Fetch search intent from DataForSEO API
 */
async function fetchSearchIntent(
  keywords: string[]
): Promise<Map<string, SearchIntentResult>> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password || keywords.length === 0) {
    return new Map();
  }

  const credentials = Buffer.from(`${login}:${password}`).toString('base64');

  const normalizedKeywords = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 3)
    )
  );

  // DataForSEO Labs Search Intent API - can process up to 1000 keywords at once
  const requestBody = [
    {
      keywords: normalizedKeywords.slice(0, 1000),
      language_name: "English",
    },
  ];

  try {
    const response = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/search_intent/live",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      console.warn("[Search Intent] API error, continuing without intent data");
      return new Map();
    }

    const data = await response.json();

    // General + per-task status checks
    if (data?.status_code !== 20000 || !Array.isArray(data?.tasks) || data.tasks.length === 0) {
      return new Map();
    }

    const task = data.tasks[0];
    if (task?.status_code !== 20000 || !Array.isArray(task?.result) || task.result.length === 0) {
      return new Map();
    }

    const intentMap = new Map<string, SearchIntentResult>();

    // DataForSEO Labs returns: tasks[0].result[0].items[]
    // Each item has: keyword, keyword_intent { label, probability }, secondary_keyword_intents[]
    const items = task.result.flatMap((r: any) => Array.isArray(r?.items) ? r.items : []);

    items.forEach((item: any) => {
      const kw: string | undefined = item?.keyword;
      const primary = item?.keyword_intent;

      if (!kw || !primary?.label) return;

      const secondaryLabels: string[] | undefined = Array.isArray(item?.secondary_keyword_intents)
        ? item.secondary_keyword_intents
            .map((x: any) => x?.label)
            .filter((x: any) => typeof x === "string")
        : undefined;

      intentMap.set(kw.toLowerCase(), {
        keyword: kw,
        main_intent: (primary.label as SearchIntentResult["main_intent"]) || "informational",
        foreign_intent: secondaryLabels,
        intent_probability: typeof primary.probability === "number" ? primary.probability : undefined,
      });
    });

    return intentMap;
  } catch (error) {
    console.error("[Search Intent] Error:", error);
    return new Map();
  }
}

/**
 * Score how well an asset matches a keyword
 */
function scoreAssetForKeyword(
  asset: Asset,
  keyword: string,
  searchIntent?: SearchIntentResult
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 1. Title relevance (30 points)
  const titleLower = asset.title.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  const keywordWords = keywordLower.split(/\s+/);
  const matchingWords = keywordWords.filter((word) => 
    titleLower.includes(word)
  );
  const titleRelevance = (matchingWords.length / keywordWords.length) * 30;
  score += titleRelevance;
  if (titleRelevance > 15) {
    reasons.push("Keyword matches asset title");
  }

  // 2. Extracted text relevance (20 points)
  if (asset.extractedText) {
    const textLower = asset.extractedText.toLowerCase();
    const textRelevance = keywordWords.filter((word) =>
      textLower.includes(word)
    ).length / keywordWords.length * 20;
    score += Math.min(textRelevance, 20);
    if (textRelevance > 10) {
      reasons.push("Keyword found in asset content");
    }
  }

  // 3. Search intent to funnel stage alignment (25 points)
  if (searchIntent) {
    const intentStageMap: Record<string, FunnelStage> = {
      informational: "TOFU_AWARENESS",
      commercial: "MOFU_CONSIDERATION",
      transactional: "BOFU_DECISION",
      navigational: "TOFU_AWARENESS",
    };
    const expectedStage = intentStageMap[searchIntent.main_intent];
    if (asset.funnelStage === expectedStage) {
      score += 25;
      reasons.push(`Intent (${searchIntent.main_intent}) matches funnel stage (${asset.funnelStage})`);
    } else {
      // Partial match - still some points
      if (
        (expectedStage === "TOFU_AWARENESS" && asset.funnelStage === "MOFU_CONSIDERATION") ||
        (expectedStage === "MOFU_CONSIDERATION" && asset.funnelStage === "BOFU_DECISION")
      ) {
        score += 10;
      }
    }
  } else {
    // Without intent data, award points based on funnel stage (BOFU for PPC)
    if (asset.funnelStage === "BOFU_DECISION") {
      score += 15;
      reasons.push("Asset is BOFU (good for PPC)");
    }
  }

  // 4. Product line alignment (15 points)
  if (asset.productLines && asset.productLines.length > 0) {
    // Check if keyword mentions product line names
    const productLineNames = asset.productLines.map(pl => pl.name.toLowerCase());
    const hasProductLineMatch = productLineNames.some(plName =>
      keywordLower.includes(plName.split(/\s+/)[0]) // Check first word of product line
    );
    if (hasProductLineMatch) {
      score += 15;
      reasons.push("Keyword matches product line");
    }
  }

  // 5. ICP alignment (10 points) - if keyword mentions role titles
  const commonRoles = ["cto", "cfo", "ceo", "vp", "director", "manager"];
  const keywordHasRole = commonRoles.some(role => keywordLower.includes(role));
  if (keywordHasRole && asset.icpTargets.length > 0) {
    const assetIcpLower = asset.icpTargets.map(icp => icp.toLowerCase());
    const hasIcpMatch = commonRoles.some(role =>
      keywordLower.includes(role) && assetIcpLower.some(icp => icp.includes(role))
    );
    if (hasIcpMatch) {
      score += 10;
      reasons.push("ICP alignment");
    }
  }

  return { score: Math.min(score, 100), reasons };
}

/**
 * Suggest ad group name based on keyword characteristics
 */
function suggestAdGroup(
  keyword: KeywordWithMatches,
  assets: Asset[]
): string {
  // Use product line if available
  if (keyword.assetMatches.length > 0) {
    const topMatch = keyword.assetMatches[0];
    const asset = assets.find(a => a.id === topMatch.assetId);
    if (asset?.productLines && asset.productLines.length > 0) {
      const productLine = asset.productLines[0].name;
      // Add intent/stage modifier
      if (keyword.searchIntent?.main_intent === "transactional") {
        return `${productLine} - BOFU (Purchase Intent)`;
      } else if (keyword.searchIntent?.main_intent === "commercial") {
        return `${productLine} - MOFU (Research)`;
      }
      return `${productLine} - ${asset.funnelStage}`;
    }
  }

  // Fallback to intent-based grouping
  if (keyword.searchIntent) {
    if (keyword.searchIntent.main_intent === "transactional") {
      return "BOFU - Purchase Intent";
    } else if (keyword.searchIntent.main_intent === "commercial") {
      return "MOFU - Research Phase";
    }
    return "TOFU - Awareness";
  }

  return "General - PPC";
}

/**
 * Suggest match type based on competition and volume
 */
function suggestMatchType(keyword: KeywordResult): "broad" | "phrase" | "exact" {
  const competitionIndex = keyword.competition_index || 0;
  
  // High competition + high volume = use phrase/exact to be more targeted
  if (competitionIndex > 0.7 && keyword.volume > 1000) {
    return "exact";
  }
  
  // Medium competition = phrase match
  if (competitionIndex > 0.4) {
    return "phrase";
  }
  
  // Low competition = broad match (more reach)
  return "broad";
}

/**
 * Calculate estimated monthly spend
 */
function estimateMonthlySpend(keyword: KeywordResult): number {
  // Estimate based on: Volume × CTR × CPC
  // Assuming average CTR: 2% for position 3-5, 5% for position 1-2
  // Conservative estimate: 1% CTR
  const estimatedClicks = keyword.volume * 0.01;
  return estimatedClicks * keyword.cpc;
}

export async function POST(request: NextRequest) {
  try {
    const accountId = await requireAccountId(request);
    const body = await request.json();

    const validation = ppcCampaignSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { assetIds, productLineId, locationName, languageName } = validation.data;

    // Fetch account preferences for location and language (use provided values or account defaults)
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        ppcLocationName: true,
        ppcLanguageName: true,
      },
    });

    const finalLocationName = locationName || account?.ppcLocationName || "United States";
    const finalLanguageName = languageName || account?.ppcLanguageName || "English";

    // Fetch selected assets with product lines
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: assetIds },
        accountId,
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        title: true,
        s3Url: true,
        s3Key: true,
        fileType: true,
        assetType: true,
        extractedText: true,
        funnelStage: true,
        icpTargets: true,
        painClusters: true,
        outreachTip: true,
        status: true,
        customCreatedAt: true,
        lastReviewedAt: true,
        contentQualityScore: true,
        expiryDate: true,
        atomicSnippets: true,
        aiModel: true,
        promptVersion: true,
        analyzedAt: true,
        aiConfidence: true,
        dominantColor: true,
        productLines: {
          include: {
            productLine: {
              select: {
                id: true,
                name: true,
                description: true,
                valueProposition: true,
                specificICP: true,
              },
            },
          },
        },
      },
    });

    if (assets.length === 0) {
      return NextResponse.json(
        { error: "No assets found or they do not belong to your account" },
        { status: 403 }
      );
    }

    // Transform assets to match Asset interface
    const transformedAssets: Asset[] = assets.map((asset) => ({
      id: asset.id,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt?.toISOString() || undefined,
      title: asset.title,
      s3Url: asset.s3Url,
      s3Key: asset.s3Key || undefined,
      fileType: asset.fileType,
      assetType: asset.assetType || undefined,
      extractedText: asset.extractedText || null,
      funnelStage: asset.funnelStage as FunnelStage,
      icpTargets: asset.icpTargets || [],
      painClusters: asset.painClusters || [],
      outreachTip: asset.outreachTip,
      status: asset.status as AssetStatus,
      customCreatedAt: asset.customCreatedAt?.toISOString() || null,
      lastReviewedAt: asset.lastReviewedAt?.toISOString() || null,
      contentQualityScore: asset.contentQualityScore || null,
      expiryDate: asset.expiryDate?.toISOString() || null,
      atomicSnippets: asset.atomicSnippets || undefined,
      aiModel: asset.aiModel || null,
      promptVersion: asset.promptVersion || null,
      analyzedAt: asset.analyzedAt?.toISOString() || null,
      aiConfidence: asset.aiConfidence || null,
      dominantColor: asset.dominantColor || null,
      inUse: false, // TODO: Add inUse field to Prisma select when available
      productLines: asset.productLines.map((ap: any) => ap.productLine),
    }));

    // Filter by product line if specified
    let relevantAssets = transformedAssets;
    if (productLineId) {
      relevantAssets = transformedAssets.filter((asset) =>
        asset.productLines?.some((pl) => pl.id === productLineId)
      );
      if (relevantAssets.length === 0) {
        relevantAssets = transformedAssets; // Fallback
      }
    }

    // Extract seed keywords from assets following best practices
    // Combine meaningful terms from titles, product lines, ICP, and pain clusters
    const seedKeywords: string[] = [];
    const seedKeywordSet = new Set<string>(); // For deduplication
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
    ]);

    // Helper to extract meaningful keywords from text
    const extractKeywords = (text: string, maxWords: number = 5): string => {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
        .slice(0, maxWords)
        .join(" ");
    };

    relevantAssets.forEach((asset) => {
      // 1. Use asset title - extract main terms (first 3-4 meaningful words for better coverage)
      const titleKeywords = extractKeywords(asset.title, 4);
      if (titleKeywords && titleKeywords.length >= 3) {
        const normalized = titleKeywords.toLowerCase();
        if (!seedKeywordSet.has(normalized)) {
          seedKeywordSet.add(normalized);
          seedKeywords.push(titleKeywords);
        }
        
        // Also try just the first 2 words (often more searchable)
        const titleWords = titleKeywords.split(/\s+/).slice(0, 2).join(" ");
        if (titleWords && titleWords.length >= 4) {
          const normalizedShort = titleWords.toLowerCase();
          if (!seedKeywordSet.has(normalizedShort)) {
            seedKeywordSet.add(normalizedShort);
            seedKeywords.push(titleWords);
          }
        }
      }

      // 2. Use product line names (often contain industry/business terms)
      asset.productLines?.forEach((pl) => {
        const plKeywords = extractKeywords(pl.name, 3);
        if (plKeywords && plKeywords.length >= 3) {
          const normalized = plKeywords.toLowerCase();
          if (!seedKeywordSet.has(normalized)) {
            seedKeywordSet.add(normalized);
            seedKeywords.push(plKeywords);
          }
        }
        
        // Also try product line + common PPC modifiers
        if (plKeywords) {
          const modifiers = ["software", "solution", "platform", "service", "tool"];
          modifiers.forEach(mod => {
            const combined = `${plKeywords} ${mod}`;
            const normalized = combined.toLowerCase();
            if (!seedKeywordSet.has(normalized)) {
              seedKeywordSet.add(normalized);
              seedKeywords.push(combined);
            }
          });
        }
      });

      // 3. Use ICP targets with product line (e.g., "CTO cloud migration")
      asset.icpTargets?.forEach((icp) => {
        const icpKeywords = extractKeywords(icp, 2);
        if (icpKeywords && asset.productLines && asset.productLines.length > 0) {
          asset.productLines.forEach(pl => {
            const plKeywords = extractKeywords(pl.name, 2);
            const combined = `${icpKeywords} ${plKeywords}`;
            const normalized = combined.toLowerCase();
            if (!seedKeywordSet.has(normalized) && combined.length >= 6) {
              seedKeywordSet.add(normalized);
              seedKeywords.push(combined);
            }
          });
        }
      });

      // 4. Use pain clusters (often good PPC terms)
      asset.painClusters?.forEach((pain) => {
        const painKeywords = extractKeywords(pain, 3);
        if (painKeywords && painKeywords.length >= 4) {
          const normalized = painKeywords.toLowerCase();
          if (!seedKeywordSet.has(normalized)) {
            seedKeywordSet.add(normalized);
            seedKeywords.push(painKeywords);
          }
        }
      });
    });

    console.log(`[PPC Campaign] Processing ${relevantAssets.length} assets`);

    // Get keywords for each asset (using BOFU for PPC focus)
    // Strategy: Use asset title + extractedText to get better keywords (not just title like content creation)
    const allKeywords: KeywordResult[] = [];
    const allWarnings: APIWarning[] = [];
    const keywordSet = new Set<string>(); // To deduplicate keywords
    let keywordAttempts = 0; // Track number of API calls made

    // Helper: append a visible marker to the cost warnings the UI already displays
    const pushWarnings = (warnings: APIWarning[]) => {
      allWarnings.push(
        ...warnings.map((w) => {
          if (w?.api === "DataForSEO" && w?.type === "cost") {
            return {
              ...w,
              message: `${w.message} [ppc-route-v2]`,
            };
          }
          return w;
        })
      );
    };

    // DEBUG MARKER: if you don't see this in the response, you're not hitting the updated route code
    // Note: Using a comment instead since APIWarning type doesn't support custom types
    // You can check if the route is updated by looking for keywordAttempts in the debug object

    // Try each asset - use title + first portion of extractedText for better coverage
    const assetsToTry = relevantAssets.slice(0, 5); // Limit to 5 assets to avoid too many API calls
    
    for (const asset of assetsToTry) {
      try {
        // STRATEGY: Analyze ENTIRE document to extract the most important terms
        // 1. Use term frequency analysis on full document content
        // 2. Identify industry-specific terms (SAP, ERP, cloud, etc.)
        // 3. Create seed keywords from most frequent meaningful terms
        // 4. Try title as secondary option
        
        const fullContent = `${asset.title} ${asset.extractedText || ""}`.toLowerCase();
        console.log(`[PPC Campaign] Analyzing full document: "${asset.title}" (${fullContent.length} chars)`);
        
        // Extract all meaningful words from ENTIRE document
        const allWords = fullContent
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopWords.has(w));
        
        // Count term frequency across entire document
        const termFrequency: Map<string, number> = new Map();
        allWords.forEach(word => {
          termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
        });
        
        // Also count 2-word phrases (bigrams) across entire document
        const bigramFrequency: Map<string, number> = new Map();
        for (let i = 0; i < allWords.length - 1; i++) {
          const bigram = `${allWords[i]} ${allWords[i + 1]}`;
          if (bigram.length > 6) {
            bigramFrequency.set(bigram, (bigramFrequency.get(bigram) || 0) + 1);
          }
        }
        
        // Sort terms by frequency and get top ones
        const topTerms = [...termFrequency.entries()]
          .filter(([term, count]) => count >= 2 && term.length > 4) // Appears at least twice
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([term]) => term);
        
        const topBigrams = [...bigramFrequency.entries()]
          .filter(([, count]) => count >= 2) // Appears at least twice
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([bigram]) => bigram);
        
        console.log(`[PPC Campaign] Top terms (by frequency):`, topTerms.slice(0, 5));
        console.log(`[PPC Campaign] Top bigrams (by frequency):`, topBigrams.slice(0, 3));
        
        // Identify industry-specific terms for better seed keywords
        const industryTerms: string[] = [];
        const industryPatterns = [
          { pattern: /\bsap\b/i, seeds: ["sap implementation", "sap consulting", "sap migration"] },
          { pattern: /\berp\b/i, seeds: ["erp software", "erp implementation", "enterprise resource planning"] },
          { pattern: /\bs4hana\b|s\/4hana|4hana/i, seeds: ["s4hana migration", "sap s4hana", "s4hana implementation"] },
          { pattern: /\bcloud\b/i, seeds: ["cloud migration", "cloud services", "cloud computing"] },
          { pattern: /\baws\b/i, seeds: ["aws consulting", "aws migration", "amazon web services"] },
          { pattern: /\bazure\b/i, seeds: ["azure consulting", "azure migration", "microsoft azure"] },
          { pattern: /\bcrm\b/i, seeds: ["crm software", "crm implementation", "customer relationship management"] },
          { pattern: /\bai\b|artificial intelligence/i, seeds: ["ai software", "artificial intelligence solutions"] },
          { pattern: /\bautomation\b/i, seeds: ["business automation", "process automation", "automation software"] },
          { pattern: /\bgovernance\b/i, seeds: ["it governance", "data governance", "corporate governance"] },
          { pattern: /\bcompliance\b/i, seeds: ["compliance software", "regulatory compliance"] },
          { pattern: /\bproject management\b/i, seeds: ["project management software", "project management tools"] },
          { pattern: /\bconsulting\b/i, seeds: ["business consulting", "it consulting", "management consulting"] },
          { pattern: /\bdigital transformation\b/i, seeds: ["digital transformation services", "digital transformation consulting"] },
        ];
        
        for (const { pattern, seeds } of industryPatterns) {
          if (pattern.test(fullContent)) {
            industryTerms.push(...seeds);
          }
        }
        
        console.log(`[PPC Campaign] Detected industry terms:`, industryTerms.slice(0, 5));
        
        // Build seed keywords to try (prioritize industry terms, then bigrams, then single terms)
        const seedCandidates = [
          ...industryTerms.slice(0, 3),      // Industry-specific first (most likely to work)
          ...topBigrams.slice(0, 3),          // Top bigrams from document
          ...topTerms.slice(0, 3),            // Top single terms
          asset.title,                         // Title as fallback
        ].filter((v, i, a) => a.indexOf(v) === i); // Deduplicate
        
        console.log(`[PPC Campaign] Seed candidates for "${asset.title}":`, seedCandidates);
        
        // Try each seed candidate
        for (const seed of seedCandidates) {
          if (allKeywords.length >= 15) break;
          
          try {
            console.log(`[PPC Campaign] Trying seed: "${seed}"`);
            keywordAttempts++;
            seedKeywords.push(seed);
            
            const { keywords, warnings } = await getStrategicKeywords(seed, "BOFU_DECISION", finalLocationName, finalLanguageName);
            pushWarnings(warnings);
            
            keywords.forEach(kw => {
              if (!keywordSet.has(kw.keyword)) {
                keywordSet.add(kw.keyword);
                allKeywords.push(kw);
              }
            });
            
            if (keywords.length > 0) {
              console.log(`[PPC Campaign] Seed "${seed}" returned ${keywords.length} keywords`);
            }
          } catch (error) {
            console.warn(`[PPC Campaign] Seed "${seed}" failed:`, error);
          }
        }
        
        if (allKeywords.length >= 15) {
          console.log(`[PPC Campaign] Got ${allKeywords.length} keywords, moving to next phase`);
          break;
        }
      } catch (error) {
        // Continue with next asset if this one fails
        console.warn(`[PPC Campaign] Asset "${asset.title}" failed:`, error);
        allWarnings.push({
          type: "error",
          message: `Failed to get keywords for asset "${asset.title}": ${error instanceof Error ? error.message : "Unknown error"}`,
          api: "DataForSEO"
        });
      }
    }
    
    // If we still don't have enough keywords, try product line names
    if (allKeywords.length < 10) {
      const productLineNames = relevantAssets
        .flatMap(a => a.productLines || [])
        .map(pl => pl.name)
        .filter((name, idx, arr) => arr.indexOf(name) === idx) // Deduplicate
        .slice(0, 3); // Limit to 3 product lines
      
        for (const plName of productLineNames) {
          try {
            console.log(`[PPC Campaign] Trying product line: "${plName}"`);
            keywordAttempts++;
            const { keywords, warnings } = await getStrategicKeywords(
              plName,
              "BOFU_DECISION",
              finalLocationName,
              finalLanguageName
            );
          
          keywords.forEach(kw => {
            if (!keywordSet.has(kw.keyword)) {
              keywordSet.add(kw.keyword);
              allKeywords.push(kw);
            }
          });
          pushWarnings(warnings);
          
          if (allKeywords.length >= 15) {
            break;
          }
        } catch (error) {
          console.warn(`[PPC Campaign] Product line "${plName}" failed:`, error);
        }
      }
    }

    console.log(`[PPC Campaign] Found ${allKeywords.length} unique keywords from ${seedKeywords.length} seed keywords`);
    
    if (allKeywords.length === 0) {
      console.warn(`[PPC Campaign] No keywords found. Seed keywords were: ${seedKeywords.join(", ")}`);
      console.warn(`[PPC Campaign] This might mean:`);
      console.warn(`  - Assets have very generic titles that don't map to searchable keywords`);
      console.warn(`  - DataForSEO API didn't return results for these seeds`);
      console.warn(`  - All returned keywords were filtered out (zero volume)`);
      
      // Try industry-level fallbacks based on detected content topics
      const genericFallbacks: string[] = [];
      
      // Analyze all seed keywords and content to detect industry/topic
      const allSeedText = seedKeywords.join(" ").toLowerCase();
      const allContentText = relevantAssets
        .map(a => `${a.title} ${a.extractedText || ""}`)
        .join(" ")
        .toLowerCase();
      const combinedText = `${allSeedText} ${allContentText}`;
      
      // Industry/topic detection - add relevant generic keywords
      if (combinedText.includes("sap") || combinedText.includes("erp") || combinedText.includes("s4hana") || combinedText.includes("4hana")) {
        genericFallbacks.push(
          "sap implementation",
          "sap consulting services",
          "erp software",
          "sap migration",
          "enterprise resource planning"
        );
      }
      if (combinedText.includes("cloud") || combinedText.includes("aws") || combinedText.includes("azure")) {
        genericFallbacks.push(
          "cloud migration services",
          "cloud consulting",
          "cloud infrastructure"
        );
      }
      if (combinedText.includes("digital transformation") || combinedText.includes("modernization")) {
        genericFallbacks.push(
          "digital transformation consulting",
          "business modernization",
          "it modernization"
        );
      }
      if (combinedText.includes("governance") || combinedText.includes("compliance")) {
        genericFallbacks.push(
          "it governance",
          "enterprise governance",
          "compliance software"
        );
      }
      if (combinedText.includes("project management") || combinedText.includes("program management")) {
        genericFallbacks.push(
          "project management software",
          "enterprise project management"
        );
      }
      if (combinedText.includes("consulting") || combinedText.includes("advisory")) {
        genericFallbacks.push(
          "business consulting services",
          "management consulting",
          "it consulting"
        );
      }
      
      // Always add some generic B2B software fallbacks
      if (genericFallbacks.length === 0) {
        genericFallbacks.push(
          "enterprise software",
          "business software",
          "b2b software",
          "saas platform"
        );
      }
      
      // Deduplicate fallbacks
      const uniqueFallbacks = [...new Set(genericFallbacks)];
      console.log(`[PPC Campaign] Trying ${uniqueFallbacks.length} industry-level fallbacks:`, uniqueFallbacks);
      
      for (const fallback of uniqueFallbacks) {
        console.log(`[PPC Campaign] Trying industry fallback: "${fallback}"`);
        keywordAttempts++;
        const { keywords, warnings } = await getStrategicKeywords(
          fallback,
          "BOFU_DECISION",
          finalLocationName,
          finalLanguageName
        );
        
        keywords.forEach(kw => {
          if (!keywordSet.has(kw.keyword)) {
            keywordSet.add(kw.keyword);
            allKeywords.push(kw);
          }
        });
        pushWarnings(warnings);
        
        if (allKeywords.length >= 5) {
          console.log(`[PPC Campaign] Found ${allKeywords.length} keywords using fallback: "${fallback}"`);
          break;
        }
      }
    }

    // Get search intent for all keywords
    const keywordStrings = allKeywords.map(k => k.keyword);
    const intentMap = await fetchSearchIntent(keywordStrings);

    // Score each keyword against each asset
    const keywordsWithMatches: KeywordWithMatches[] = allKeywords.map((keyword) => {
      const searchIntent = intentMap.get(keyword.keyword.toLowerCase());
      
      const assetMatches: AssetMatch[] = relevantAssets.map((asset) => {
        const { score, reasons } = scoreAssetForKeyword(asset, keyword.keyword, searchIntent);
        return {
          assetId: asset.id,
          assetTitle: asset.title,
          score,
          reasons,
          funnelStage: asset.funnelStage,
          productLines: asset.productLines?.map(pl => pl.name) || [],
        };
      });

      // Sort by score descending
      assetMatches.sort((a, b) => b.score - a.score);

      // Get recommended asset (highest score if > 50)
      const recommendedAsset = assetMatches[0]?.score > 50 
        ? assetMatches[0].assetId 
        : undefined;

      const adGroupSuggestion = suggestAdGroup(
        { ...keyword, assetMatches, searchIntent },
        relevantAssets
      );

      const matchType = suggestMatchType(keyword);
      const estimatedMonthlySpend = estimateMonthlySpend(keyword);

      return {
        ...keyword,
        searchIntent,
        assetMatches,
        recommendedAssetId: recommendedAsset,
        adGroupSuggestion,
        matchType,
        estimatedMonthlySpend,
      };
    });

    // Group keywords into ad groups
    const adGroups = new Map<string, KeywordWithMatches[]>();
    keywordsWithMatches.forEach((kw) => {
      const groupName = kw.adGroupSuggestion || "General";
      if (!adGroups.has(groupName)) {
        adGroups.set(groupName, []);
      }
      adGroups.get(groupName)!.push(kw);
    });

    // Convert ad groups to array
    const adGroupsArray = Array.from(adGroups.entries()).map(([name, keywords]) => ({
      name,
      keywords: keywords.length,
      estimatedMonthlySpend: keywords.reduce((sum, kw) => sum + (kw.estimatedMonthlySpend || 0), 0),
    }));

    // Negative keyword suggestions (simplified - identify unrelated high-volume keywords)
    const negativeKeywords: string[] = [];
    // In a real implementation, you'd analyze keyword intent mismatches
    // For now, return empty array

    return NextResponse.json({
      keywords: keywordsWithMatches,
      adGroups: adGroupsArray,
      negativeKeywords,
      metadata: {
        assetCount: relevantAssets.length,
        keywordCount: keywordsWithMatches.length,
        totalEstimatedMonthlySpend: keywordsWithMatches.reduce(
          (sum, kw) => sum + (kw.estimatedMonthlySpend || 0),
          0
        ),
        productLine: productLineId
          ? relevantAssets[0]?.productLines?.[0]?.name || null
          : null,
      },
      debug: {
        keywordAttempts,
        seedKeywordsCount: seedKeywords.length,
        seedKeywords,
      },
      warnings: allWarnings,
    });
  } catch (error) {
    console.error("Error building PPC campaign:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("No account selected")) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to build PPC campaign", details: errorMessage },
      { status: 500 }
    );
  }
}
