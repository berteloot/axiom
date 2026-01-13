/**
 * B2B Marketing Asset Type Taxonomy
 * 
 * This file defines the standard taxonomy for marketing asset types.
 * Used for AI classification, UI selection, and reporting.
 */

export interface AssetTypeGroup {
  label: string;
  options: string[];
}

/**
 * Grouped asset types by category for UI display
 */
export const ASSET_TYPES_GROUPED: AssetTypeGroup[] = [
  {
    label: "Proof & Validation",
    options: [
      "Case Study",
      "Customer Testimonial",
      "ROI Calculator",
      "Use Case",
      "Customer Story",
    ],
  },
  {
    label: "Thought Leadership",
    options: [
      "Whitepaper",
      "eBook",
      "Research Report",
      "Trend Analysis",
      "Guide",
    ],
  },
  {
    label: "Sales Enablement",
    options: [
      "Sales Deck",
      "One-Pager",
      "Solution Brief",
      "Battlecard",
      "Pricing Sheet",
      "Proposal",
    ],
  },
  {
    label: "Awareness",
    options: [
      "Blog Post",
      "Article",
      "Infographic",
      "Press Release",
      "Newsletter",
    ],
  },
  {
    label: "Video & Audio",
    options: [
      "Webinar Recording",
      "Product Demo",
      "Explainer Video",
      "Podcast Episode",
      "Event Recording",
    ],
  },
  {
    label: "Technical",
    options: [
      "Technical Documentation",
      "User Guide",
      "API Reference",
      "Release Notes",
      "Data Sheet",
    ],
  },
];

/**
 * Flat array of all asset type values for validation
 * Sorted alphabetically for consistent UI display
 */
export const ASSET_TYPE_VALUES: string[] = ASSET_TYPES_GROUPED.flatMap(
  (group) => group.options
).sort((a, b) => a.localeCompare(b));

/**
 * Map legacy AI enum values to new taxonomy
 * This helps migrate from old AI classifications to new ones
 */
export const LEGACY_TO_NEW_ASSET_TYPE: Record<string, string> = {
  Whitepaper: "Whitepaper",
  Case_Study: "Case Study",
  Blog_Post: "Blog Post",
  Infographic: "Infographic",
  Webinar_Recording: "Webinar Recording",
  Sales_Deck: "Sales Deck",
  Technical_Doc: "Technical Documentation",
};

/**
 * Convert legacy asset type format (with underscores) to new format (with spaces)
 */
export function normalizeAssetType(assetType: string | null | undefined): string | null {
  if (!assetType) return null;
  
  // Check if it's a legacy format
  if (LEGACY_TO_NEW_ASSET_TYPE[assetType]) {
    return LEGACY_TO_NEW_ASSET_TYPE[assetType];
  }
  
  // If it already matches a valid type, return as-is
  if (ASSET_TYPE_VALUES.includes(assetType)) {
    return assetType;
  }
  
  // Try to convert underscores to spaces and title case
  const normalized = assetType
    .replace(/_/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  
  // Check if normalized version exists
  if (ASSET_TYPE_VALUES.includes(normalized)) {
    return normalized;
  }
  
  // Return original if no match found
  return assetType;
}

/**
 * Detect asset type from URL patterns
 * Returns detected type or null if unknown
 */
export function detectAssetTypeFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    const pathSegments = path.split('/').filter(s => s.length > 0);
    
    // URL pattern mappings (order matters - more specific first)
    const patterns: Array<{ pattern: RegExp | string; type: string }> = [
      // Case Studies
      { pattern: /case-stud(y|ies)|customer-stor(y|ies)|success-stor(y|ies)/i, type: "Case Study" },
      { pattern: /testimonial/i, type: "Customer Testimonial" },
      { pattern: /use-case/i, type: "Use Case" },
      
      // Whitepapers & eBooks
      { pattern: /whitepaper|white-paper/i, type: "Whitepaper" },
      { pattern: /ebook|e-book/i, type: "eBook" },
      { pattern: /research-report/i, type: "Research Report" },
      { pattern: /guide|how-to/i, type: "Guide" },
      
      // Webinars & Videos
      { pattern: /webinar/i, type: "Webinar Recording" },
      { pattern: /demo|product-demo/i, type: "Product Demo" },
      { pattern: /video|explainer/i, type: "Explainer Video" },
      { pattern: /podcast/i, type: "Podcast Episode" },
      { pattern: /event|recording/i, type: "Event Recording" },
      
      // Sales Enablement
      { pattern: /sales-deck|pitch-deck/i, type: "Sales Deck" },
      { pattern: /one-pager|one-pager|datasheet/i, type: "One-Pager" },
      { pattern: /solution-brief|solution-overview/i, type: "Solution Brief" },
      { pattern: /battlecard/i, type: "Battlecard" },
      { pattern: /pricing/i, type: "Pricing Sheet" },
      { pattern: /proposal/i, type: "Proposal" },
      
      // Blog & Articles
      { pattern: /blog|post|article/i, type: "Blog Post" },
      { pattern: /news|press-release|announcement/i, type: "Press Release" },
      { pattern: /newsletter/i, type: "Newsletter" },
      
      // Technical
      { pattern: /documentation|docs|api-reference/i, type: "Technical Documentation" },
      { pattern: /user-guide|getting-started/i, type: "User Guide" },
      { pattern: /release-notes|changelog/i, type: "Release Notes" },
      { pattern: /data-sheet|datasheet/i, type: "Data Sheet" },
      
      // Other
      { pattern: /infographic/i, type: "Infographic" },
    ];
    
    // Check full path first
    for (const { pattern, type } of patterns) {
      if (typeof pattern === 'string') {
        if (path.includes(pattern)) return type;
      } else {
        if (pattern.test(path)) return type;
      }
    }
    
    // Check individual path segments
    for (const segment of pathSegments) {
      for (const { pattern, type } of patterns) {
        if (typeof pattern === 'string') {
          if (segment.includes(pattern)) return type;
        } else {
          if (pattern.test(segment)) return type;
        }
      }
    }
    
    // Default to Blog Post if URL contains common blog indicators
    if (path.includes('blog') || path.includes('post') || path.includes('article')) {
      return "Blog Post";
    }
    
    return null; // Unknown type
  } catch {
    return null;
  }
}
