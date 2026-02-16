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

/** Generate CSV header row from platform fields (single source of truth). */
export function generateCsvColumns(fields: Record<string, FieldSpec>): string[] {
  const cols = ["Campaign"];
  for (const spec of Object.values(fields)) {
    for (let i = 0; i < spec.default_count; i++) {
      cols.push(`${spec.label} ${i + 1}`);
    }
  }
  return cols;
}

function definePlatform(
  key: PlatformKey,
  name: string,
  description: string,
  fields: Record<string, FieldSpec>
): PlatformConfig {
  return {
    key,
    name,
    description,
    fields,
    csv_columns: generateCsvColumns(fields),
  };
}

export const PLATFORMS: Record<PlatformKey, PlatformConfig> = {
  google_ads_rsa: definePlatform(
    "google_ads_rsa",
    "Google Ads (Responsive Search Ad)",
    "Responsive Search Ads with multiple headlines and descriptions that Google mixes and matches.",
    {
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
    }
  ),
  meta_ads: definePlatform(
    "meta_ads",
    "Meta Ads (Facebook & Instagram)",
    "Primary text, headlines, and descriptions for Facebook and Instagram ads.",
    {
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
    }
  ),
  linkedin_ads: definePlatform(
    "linkedin_ads",
    "LinkedIn Ads (Sponsored Content)",
    "Introductory text, headlines, and descriptions for LinkedIn sponsored content.",
    {
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
    }
  ),
  x_ads: definePlatform(
    "x_ads",
    "X (Twitter) Ads",
    "Tweet copy and card headlines for X (Twitter) ads.",
    {
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
    }
  ),
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

/** Validate field constraints (e.g. min_count <= max_count). Run at module load. */
function validateFieldSpec(spec: FieldSpec, fieldKey: string): void {
  if (spec.min_count > spec.max_count) {
    throw new Error(
      `platforms: ${fieldKey}: min_count (${spec.min_count}) > max_count (${spec.max_count})`
    );
  }
  if (spec.default_count < spec.min_count || spec.default_count > spec.max_count) {
    throw new Error(
      `platforms: ${fieldKey}: default_count (${spec.default_count}) must be between min_count and max_count`
    );
  }
}

function validatePlatformConfig(config: PlatformConfig): void {
  for (const [fieldKey, spec] of Object.entries(config.fields)) {
    validateFieldSpec(spec, fieldKey);
  }
}

// Validate all platforms at load time
for (const platform of Object.values(PLATFORMS)) {
  validatePlatformConfig(platform);
}
