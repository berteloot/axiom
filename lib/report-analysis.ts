import { Asset, FunnelStage } from './types';
import { getJobTitleByTitle, type FunctionalArea, type SeniorityLevel } from './job-titles';

// BrandContext type based on Prisma schema
export interface BrandContext {
  id: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
  brandVoice: string[];
  competitors: string[];
  targetIndustries: string[];
  websiteUrl?: string;
  painClusters: string[];
  keyDifferentiators: string[];
  primaryICPRoles: string[];
  useCases: string[];
  roiClaims: string[];
  valueProposition?: string;
  customICPTargets: string[];
}

// Report data types
export interface ReportData {
  healthScore: number;
  inventoryBreakdown: {
    byStage: Record<FunnelStage, number>;
    byAssetType: Record<string, number>;
    total: number;
  };
  inUseBreakdown: {
    inUse: number;
    available: number;
    total: number;
  };
  byProductLine: Record<string, number>;
  coverageHeatmap: {
    // Count of assets for each persona at each funnel stage
    personaCoverage: Record<string, Record<FunnelStage, number>>;
    totalPersonas: number;
    totalGaps: number; // number of persona-stage cells with 0 assets
  };
  gapAnalysis: {
    criticalGaps: Gap[];
    contentGaps: Gap[];
    conversionRisks: Gap[];
  };
  strategicWins: string[];
  recommendations: string[];
  generatedAt: string;
  clientName?: string;
  generatedBy?: string; // User who produced the report
  assetDetailsByICP: {
    [icpTarget: string]: Array<{
      title: string;
      function: FunctionalArea | null;
      seniority: SeniorityLevel | null;
      painClusters: string[];
      funnelStage: FunnelStage;
    }>;
  };
  assetDetailsByPainCluster: {
    [painCluster: string]: Array<{
      title: string;
      function: FunctionalArea | null;
      seniority: SeniorityLevel | null;
      icpTargets: string[];
      funnelStage: FunnelStage;
    }>;
  };
}

export interface Gap {
  type: 'critical' | 'content' | 'risk';
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  details?: string[];
}

const STAGES: FunnelStage[] = [
  "TOFU_AWARENESS",
  "MOFU_CONSIDERATION",
  "BOFU_DECISION",
  "RETENTION",
];

const STAGE_DISPLAY: Record<FunnelStage, string> = {
  TOFU_AWARENESS: "TOFU",
  MOFU_CONSIDERATION: "MOFU",
  BOFU_DECISION: "BOFU",
  RETENTION: "RETENTION",
};

function inferClientName(brandContext?: BrandContext): string | undefined {
  const url = brandContext?.websiteUrl;
  if (!url) return undefined;

  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    // If websiteUrl is not a valid URL, fall back to raw string trimmed
    const trimmed = url.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

/**
 * Generate comprehensive report data for the Client Asset Strategy Report
 */
export function generateReportData(assets: Asset[], brandContext?: BrandContext, generatedBy?: string): ReportData {
  const generatedAt = new Date().toISOString();

  // Get all unique ICP targets/personas
  const allPersonas = new Set<string>();
  if (brandContext) {
    brandContext.primaryICPRoles.forEach(role => allPersonas.add(role));
    brandContext.customICPTargets.forEach(target => allPersonas.add(target));
  }
  assets.forEach(asset => {
    asset.icpTargets.forEach(icp => allPersonas.add(icp));
  });

  const personas = Array.from(allPersonas);

  // Calculate health score
  const healthScore = calculateHealthScore(assets, personas, brandContext);

  // Inventory breakdown
  const inventoryBreakdown = calculateInventoryBreakdown(assets);

  // In-use vs available breakdown
  const inUseBreakdown = calculateInUseBreakdown(assets);

  // Assets per product line
  const byProductLine = calculateByProductLine(assets);

  // Coverage heatmap
  const coverageHeatmap = calculateCoverageHeatmap(assets, personas);

  // Gap analysis
  const gapAnalysis = calculateGapAnalysis(assets, personas, brandContext);

  // Strategic wins
  const strategicWins = calculateStrategicWins(assets, personas, brandContext);

  // Recommendations
  const recommendations = generateRecommendations(gapAnalysis, strategicWins);

  // Asset details by ICP
  const assetDetailsByICP = calculateAssetDetailsByICP(assets);

  // Asset details by Pain Cluster
  const assetDetailsByPainCluster = calculateAssetDetailsByPainCluster(assets);

  return {
    healthScore,
    inventoryBreakdown,
    inUseBreakdown,
    byProductLine,
    coverageHeatmap,
    gapAnalysis,
    strategicWins,
    recommendations,
    generatedAt,
    clientName: inferClientName(brandContext),
    generatedBy,
    assetDetailsByICP,
    assetDetailsByPainCluster,
  };
}

/**
 * Calculate overall health score (0-100) based on coverage, quality, and completeness
 */
function calculateHealthScore(assets: Asset[], personas: string[], brandContext?: BrandContext): number {
  if (assets.length === 0) return 0;

  let score = 0;
  const maxScore = 100;

  // Coverage score (40% weight) - How well personas and stages are covered
  const coverageScore = calculateCoverageScore(assets, personas);
  score += coverageScore * 0.4;

  // Quality score (30% weight) - Average quality of assets
  const qualityScore = calculateQualityScore(assets);
  score += qualityScore * 0.3;

  // Completeness score (30% weight) - BOFU coverage and gap analysis
  const completenessScore = calculateCompletenessScore(assets, personas, brandContext);
  score += completenessScore * 0.3;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate coverage score based on persona/stage matrix coverage
 */
function calculateCoverageScore(assets: Asset[], personas: string[]): number {
  if (personas.length === 0) return 0;

  const totalCells = personas.length * STAGES.length;
  let filledCells = 0;

  personas.forEach(persona => {
    STAGES.forEach(stage => {
      const hasAssets = assets.some(
        asset => asset.icpTargets.includes(persona) && asset.funnelStage === stage
      );
      if (hasAssets) filledCells++;
    });
  });

  return (filledCells / totalCells) * 100;
}

/**
 * Calculate quality score based on content quality scores
 */
function calculateQualityScore(assets: Asset[]): number {
  const scoredAssets = assets.filter(asset =>
    asset.contentQualityScore !== null &&
    asset.contentQualityScore !== undefined
  );

  if (scoredAssets.length === 0) return 50; // Default if no scores available

  const averageScore = scoredAssets.reduce((sum, asset) =>
    sum + (asset.contentQualityScore || 0), 0
  ) / scoredAssets.length;

  return averageScore;
}

/**
 * Calculate completeness score based on BOFU coverage and gap analysis
 */
function calculateCompletenessScore(assets: Asset[], personas: string[], brandContext?: BrandContext): number {
  let score = 100;

  // Penalize for BOFU coverage < 10%
  const bofuAssets = assets.filter(asset => asset.funnelStage === 'BOFU_DECISION');
  const bofuRatio = assets.length > 0 ? (bofuAssets.length / assets.length) : 0;
  if (bofuRatio < 0.1) {
    score -= 20;
  }

  // Penalize for personas with no assets
  const personasWithoutAssets = personas.filter(persona =>
    !assets.some(asset => asset.icpTargets.includes(persona))
  );
  score -= personasWithoutAssets.length * 5;

  // Penalize for missing pain point coverage
  if (brandContext) {
    const mentionedPainPoints = new Set<string>();
    assets.forEach(asset => {
      if (asset.extractedText) {
        brandContext.painClusters.forEach(pain => {
          if (asset.extractedText?.toLowerCase().includes(pain.toLowerCase())) {
            mentionedPainPoints.add(pain);
          }
        });
      }
    });

    const unmentionedPainPoints = brandContext.painClusters.filter(
      pain => !mentionedPainPoints.has(pain)
    );
    score -= unmentionedPainPoints.length * 3;
  }

  return Math.max(0, score);
}

/**
 * Calculate inventory breakdown by stage and asset type
 */
function calculateInventoryBreakdown(assets: Asset[]) {
  const byStage: Record<FunnelStage, number> = {
    TOFU_AWARENESS: 0,
    MOFU_CONSIDERATION: 0,
    BOFU_DECISION: 0,
    RETENTION: 0,
  };

  const byAssetType: Record<string, number> = {};

  assets.forEach(asset => {
    byStage[asset.funnelStage]++;

    // Prefer logical assetType (from AI classification) when available; fall back to fileType.
    const assetTypeLabel = (asset as any).assetType || asset.fileType || 'Unknown';
    byAssetType[assetTypeLabel] = (byAssetType[assetTypeLabel] || 0) + 1;
  });

  return {
    byStage,
    byAssetType,
    total: assets.length,
  };
}

/**
 * Calculate breakdown of assets in use vs available
 */
function calculateInUseBreakdown(assets: Asset[]) {
  let inUse = 0;
  let available = 0;

  assets.forEach(asset => {
    if (asset.inUse === true) {
      inUse++;
    } else {
      available++;
    }
  });

  return {
    inUse,
    available,
    total: assets.length,
  };
}

/**
 * Calculate assets per product line
 */
function calculateByProductLine(assets: Asset[]): Record<string, number> {
  const byProductLine: Record<string, number> = {};
  let unassigned = 0;

  assets.forEach(asset => {
    if (asset.productLines && asset.productLines.length > 0) {
      asset.productLines.forEach(productLine => {
        const productLineName = productLine.name || 'Unknown';
        byProductLine[productLineName] = (byProductLine[productLineName] || 0) + 1;
      });
    } else {
      unassigned++;
    }
  });

  if (unassigned > 0) {
    byProductLine['Unassigned'] = unassigned;
  }

  return byProductLine;
}

/**
 * Calculate coverage heatmap showing which personas have content at which stages
 */
function calculateCoverageHeatmap(assets: Asset[], personas: string[]) {
  const personaCoverage: Record<string, Record<FunnelStage, number>> = {};

  personas.forEach(persona => {
    personaCoverage[persona] = {
      TOFU_AWARENESS: 0,
      MOFU_CONSIDERATION: 0,
      BOFU_DECISION: 0,
      RETENTION: 0,
    };

    STAGES.forEach(stage => {
      const count = assets.filter(
        asset => asset.icpTargets.includes(persona) && asset.funnelStage === stage
      ).length;
      personaCoverage[persona][stage] = count;
    });
  });

  // Count total gaps (cells with 0 assets)
  let totalGaps = 0;
  Object.values(personaCoverage).forEach(stageCoverage => {
    Object.values(stageCoverage).forEach(count => {
      if (count === 0) totalGaps++;
    });
  });

  return {
    personaCoverage,
    totalPersonas: personas.length,
    totalGaps,
  };
}

/**
 * Calculate gap analysis including critical gaps, content gaps, and conversion risks
 */
function calculateGapAnalysis(assets: Asset[], personas: string[], brandContext?: BrandContext): {
  criticalGaps: Gap[];
  contentGaps: Gap[];
  conversionRisks: Gap[];
} {
  const criticalGaps: Gap[] = [];
  const contentGaps: Gap[] = [];
  const conversionRisks: Gap[] = [];

  // Critical Gaps: Personas with 0 assets
  const personasWithoutAssets = personas.filter(persona =>
    !assets.some(asset => asset.icpTargets.includes(persona))
  );

  if (personasWithoutAssets.length > 0) {
    criticalGaps.push({
      type: 'critical',
      title: 'Missing Persona Coverage',
      description: `${personasWithoutAssets.length} defined personas have no content assets.`,
      severity: personasWithoutAssets.length > 3 ? 'high' : 'medium',
      details: personasWithoutAssets.map(persona => `No assets for ${persona}`),
    });
  }

  // Content Gaps: Pain points not mentioned
  if (brandContext) {
    const mentionedPainPoints = new Set<string>();
    assets.forEach(asset => {
      if (asset.extractedText) {
        brandContext.painClusters.forEach(pain => {
          if (asset.extractedText?.toLowerCase().includes(pain.toLowerCase())) {
            mentionedPainPoints.add(pain);
          }
        });
      }
    });

    const unmentionedPainPoints = brandContext.painClusters.filter(
      pain => !mentionedPainPoints.has(pain)
    );

    if (unmentionedPainPoints.length > 0) {
      contentGaps.push({
        type: 'content',
        title: 'Unaddressed Pain Points',
        description: `${unmentionedPainPoints.length} defined pain points are never mentioned in your content.`,
        severity: unmentionedPainPoints.length > 2 ? 'medium' : 'low',
        details: unmentionedPainPoints.map(pain => `No content addressing "${pain}"`),
      });
    }
  }

  // Conversion Risks: Low BOFU coverage
  const bofuAssets = assets.filter(asset => asset.funnelStage === 'BOFU_DECISION');
  const bofuRatio = assets.length > 0 ? (bofuAssets.length / assets.length) : 0;

  if (bofuRatio < 0.1) {
    conversionRisks.push({
      type: 'risk',
      title: 'Conversion Content Deficiency',
      description: `Only ${Math.round(bofuRatio * 100)}% of assets are Decision-stage content. Sales teams lack materials for closing deals.`,
      severity: bofuRatio < 0.05 ? 'high' : 'medium',
      details: [
        'Consider creating more case studies, demos, and ROI calculators',
        'BOFU content should represent at least 10% of total assets',
      ],
    });
  }

  return {
    criticalGaps,
    contentGaps,
    conversionRisks,
  };
}

/**
 * Identify strategic wins and strengths
 */
function calculateStrategicWins(assets: Asset[], personas: string[], brandContext?: BrandContext): string[] {
  const wins: string[] = [];

  // Strong persona coverage
  const personaCoverage = personas.map(persona => {
    const personaAssets = assets.filter(asset => asset.icpTargets.includes(persona));
    return { persona, count: personaAssets.length };
  }).sort((a, b) => b.count - a.count);

  if (personaCoverage.length > 0 && personaCoverage[0].count > 5) {
    wins.push(`Strong coverage for ${personaCoverage[0].persona} (${personaCoverage[0].count} assets)`);
  }

  // Well-covered pain points
  if (brandContext) {
    const painPointCoverage = brandContext.painClusters.map(pain => {
      const mentions = assets.filter(asset =>
        asset.extractedText?.toLowerCase().includes(pain.toLowerCase())
      ).length;
      return { pain, mentions };
    }).sort((a, b) => b.mentions - a.mentions);

    if (painPointCoverage.length > 0 && painPointCoverage[0].mentions > 3) {
      wins.push(`Comprehensive content addressing "${painPointCoverage[0].pain}" (${painPointCoverage[0].mentions} mentions)`);
    }
  }

  // Balanced funnel coverage
  const stageCounts = STAGES.map(stage =>
    assets.filter(asset => asset.funnelStage === stage).length
  );
  const maxCount = Math.max(...stageCounts);
  const minCount = Math.min(...stageCounts);
  const balanceRatio = maxCount > 0 ? minCount / maxCount : 0;

  if (balanceRatio > 0.7) {
    wins.push('Well-balanced content across all funnel stages');
  }

  // High-quality assets
  const highQualityAssets = assets.filter(asset =>
    (asset.contentQualityScore || 0) >= 80
  );

  if (highQualityAssets.length > assets.length * 0.3) {
    wins.push(`${highQualityAssets.length} high-quality assets (80+ score) ready for sales teams`);
  }

  return wins;
}

/**
 * Generate actionable recommendations based on gaps and wins
 */
function generateRecommendations(gapAnalysis: ReturnType<typeof calculateGapAnalysis>, strategicWins: string[]): string[] {
  const recommendations: string[] = [];

  // Address critical gaps first
  gapAnalysis.criticalGaps.forEach(gap => {
    if (gap.details) {
      gap.details.forEach(detail => {
        recommendations.push(`Create content assets targeting ${detail.replace('No assets for ', '')}`);
      });
    }
  });

  // Address content gaps
  gapAnalysis.contentGaps.forEach(gap => {
    if (gap.details) {
      gap.details.forEach(detail => {
        const painPoint = detail.replace('No content addressing "', '').replace('"', '');
        recommendations.push(`Develop content that specifically addresses "${painPoint}" pain point`);
      });
    }
  });

  // Address conversion risks
  gapAnalysis.conversionRisks.forEach(gap => {
    if (gap.details) {
      recommendations.push(...gap.details);
    }
  });

  // If no major gaps, suggest optimization
  if (recommendations.length === 0) {
    recommendations.push('Focus on optimizing existing high-performing content');
    recommendations.push('Consider expanding coverage for emerging ICP personas');
    recommendations.push('Review and update older assets to maintain freshness');
  }

  return recommendations.slice(0, 5); // Limit to top 5 recommendations
}

/**
 * Calculate asset details grouped by ICP target
 * Includes Title, Function, Seniority, Pain Clusters, and Funnel Stage for each asset
 */
function calculateAssetDetailsByICP(assets: Asset[]): ReportData['assetDetailsByICP'] {
  const detailsByICP: ReportData['assetDetailsByICP'] = {};

  assets.forEach(asset => {
    asset.icpTargets.forEach(icpTarget => {
      if (!detailsByICP[icpTarget]) {
        detailsByICP[icpTarget] = [];
      }

      // Extract Function and Seniority from ICP target (job title)
      const jobTitle = getJobTitleByTitle(icpTarget);
      const functionArea = jobTitle?.function || null;
      const seniority = jobTitle?.seniority || null;

      detailsByICP[icpTarget].push({
        title: asset.title,
        function: functionArea,
        seniority: seniority,
        painClusters: asset.painClusters,
        funnelStage: asset.funnelStage,
      });
    });
  });

  return detailsByICP;
}

/**
 * Calculate asset details grouped by Pain Cluster
 * Includes Title, Function, Seniority, ICP Targets, and Funnel Stage for each asset
 */
function calculateAssetDetailsByPainCluster(assets: Asset[]): ReportData['assetDetailsByPainCluster'] {
  const detailsByPainCluster: ReportData['assetDetailsByPainCluster'] = {};

  assets.forEach(asset => {
    asset.painClusters.forEach(painCluster => {
      if (!detailsByPainCluster[painCluster]) {
        detailsByPainCluster[painCluster] = [];
      }

      // For each asset in a pain cluster, we need to extract Function and Seniority
      // from the ICP targets. If there are multiple ICP targets, we'll include all functions/seniorities
      // For now, we'll take the first ICP target's function/seniority, or aggregate if needed
      const firstIcpTarget = asset.icpTargets[0];
      const jobTitle = firstIcpTarget ? getJobTitleByTitle(firstIcpTarget) : null;
      const functionArea = jobTitle?.function || null;
      const seniority = jobTitle?.seniority || null;

      detailsByPainCluster[painCluster].push({
        title: asset.title,
        function: functionArea,
        seniority: seniority,
        icpTargets: asset.icpTargets,
        funnelStage: asset.funnelStage,
      });
    });
  });

  return detailsByPainCluster;
}