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
 */
export const ASSET_TYPE_VALUES: string[] = ASSET_TYPES_GROUPED.flatMap(
  (group) => group.options
);

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
