/**
 * Platform config for all ad channels. Used by prompts, validation, and export.
 * Aligns with AdCopy Pro: one config drives prompts, MCP tools, and UI.
 */

export type PlatformKey = "google_ads_rsa" | "meta_ads" | "linkedin_ads" | "x_ads";

export type FieldSpec = {
  label: string;
  max_chars: number;
  min_count: number;
  max_count: number;
  default_count: number;
  help?: string;
};

export type PlatformConfig = {
  key: PlatformKey;
  name: string;
  description: string;
  fields: Record<string, FieldSpec>;
  csv_columns: string[];
};

export const PLATFORMS: Record<PlatformKey, PlatformConfig> = {
  google_ads_rsa: {
    key: "google_ads_rsa",
    name: "Google Ads (Responsive Search Ad)",
    description: "Responsive Search Ads with multiple headlines and descriptions that Google mixes and matches.",
    fields: {
      headlines: {
        label: "Headlines",
        max_chars: 30,
        min_count: 5,
        max_count: 15,
        default_count: 15,
        help: "Up to 15 headlines, max 30 chars each",
      },
      descriptions: {
        label: "Descriptions",
        max_chars: 90,
        min_count: 2,
        max_count: 4,
        default_count: 4,
        help: "Up to 4 descriptions, max 90 chars each",
      },
    },
    csv_columns: ["Campaign", "Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5", "Headline 6", "Headline 7", "Headline 8", "Headline 9", "Headline 10", "Headline 11", "Headline 12", "Headline 13", "Headline 14", "Headline 15", "Description 1", "Description 2", "Description 3", "Description 4"],
  },
  meta_ads: {
    key: "meta_ads",
    name: "Meta Ads (Facebook & Instagram)",
    description: "Primary text, headlines, and descriptions for Facebook and Instagram ads.",
    fields: {
      primary_text: {
        label: "Primary Text",
        max_chars: 125,
        min_count: 1,
        max_count: 5,
        default_count: 3,
        help: "Main ad copy, max 125 chars",
      },
      headlines: {
        label: "Headlines",
        max_chars: 40,
        min_count: 1,
        max_count: 5,
        default_count: 5,
        help: "Max 40 chars each",
      },
      descriptions: {
        label: "Descriptions",
        max_chars: 155,
        min_count: 1,
        max_count: 5,
        default_count: 3,
        help: "Max 155 chars each",
      },
    },
    csv_columns: ["Campaign", "Primary Text 1", "Primary Text 2", "Primary Text 3", "Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5", "Description 1", "Description 2", "Description 3"],
  },
  linkedin_ads: {
    key: "linkedin_ads",
    name: "LinkedIn Ads (Sponsored Content)",
    description: "Introductory text, headlines, and descriptions for LinkedIn sponsored content.",
    fields: {
      introductory_text: {
        label: "Introductory Text",
        max_chars: 150,
        min_count: 1,
        max_count: 5,
        default_count: 3,
        help: "Max 150 chars each",
      },
      headlines: {
        label: "Headlines",
        max_chars: 70,
        min_count: 1,
        max_count: 5,
        default_count: 5,
        help: "Max 70 chars each",
      },
      descriptions: {
        label: "Descriptions",
        max_chars: 100,
        min_count: 1,
        max_count: 5,
        default_count: 3,
        help: "Max 100 chars each",
      },
    },
    csv_columns: ["Campaign", "Introductory Text 1", "Introductory Text 2", "Introductory Text 3", "Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5", "Description 1", "Description 2", "Description 3"],
  },
  x_ads: {
    key: "x_ads",
    name: "X (Twitter) Ads",
    description: "Tweet copy and card headlines for X (Twitter) ads.",
    fields: {
      tweet_text: {
        label: "Tweet Text",
        max_chars: 280,
        min_count: 1,
        max_count: 5,
        default_count: 5,
        help: "Max 280 chars (tweet limit)",
      },
      card_headlines: {
        label: "Card Headlines",
        max_chars: 70,
        min_count: 1,
        max_count: 5,
        default_count: 3,
        help: "For website card, max 70 chars each",
      },
    },
    csv_columns: ["Campaign", "Tweet 1", "Tweet 2", "Tweet 3", "Tweet 4", "Tweet 5", "Card Headline 1", "Card Headline 2", "Card Headline 3"],
  },
};

export function getPlatform(key: PlatformKey): PlatformConfig {
  const p = PLATFORMS[key];
  if (!p) throw new Error(`Unknown platform: ${key}`);
  return p;
}

/** Platform limits for MCP validate_character_limits tool */
export function getPlatformLimits(key: PlatformKey): Record<string, number> {
  const platform = getPlatform(key);
  const limits: Record<string, number> = {};
  for (const [fieldKey, spec] of Object.entries(platform.fields)) {
    limits[fieldKey] = spec.max_chars;
  }
  return limits;
}
