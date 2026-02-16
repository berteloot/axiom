/**
 * MCP tools for AdCopy Pro: validation and CSV export.
 * Shared across all ad channels; inputs are platform-specific.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getPlatform, generateCsvColumns, type PlatformKey } from "./platforms";

function escapeCsvCell(value: string): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a single CSV row from platform config and copy data (DRY with platforms.ts). */
function buildCsvForPlatform(
  platformKey: PlatformKey,
  copyData: Record<string, string[]>,
  campaignName: string
): string {
  const platform = getPlatform(platformKey);
  const headers = generateCsvColumns(platform.fields);
  const row: string[] = [campaignName];
  for (const [fieldKey, spec] of Object.entries(platform.fields)) {
    const values = copyData[fieldKey] || [];
    for (let i = 0; i < spec.default_count; i++) {
      row.push(values[i] ?? "");
    }
  }
  const csv = [headers.map(escapeCsvCell).join(","), row.map(escapeCsvCell).join(",")].join("\r\n");
  return csv;
}

/** Validate copy against platform character limits */
const validateCharacterLimitsTool = tool(
  "validate_character_limits",
  "Validates ad copy against platform character limits. Pass copy_data (JSON of generated copy) and platform_limits (e.g. {headlines: 30, descriptions: 90}). Returns validation result with any violations.",
  z.object({
    copy_data: z.record(z.union([z.string(), z.array(z.string())])),
    platform_limits: z.record(z.number()),
  }),
  async (args) => {
    const violations: string[] = [];
    for (const [field, limit] of Object.entries(args.platform_limits)) {
      const values = args.copy_data[field];
      if (!values) continue;
      const arr = Array.isArray(values) ? values : [values];
      for (let i = 0; i < arr.length; i++) {
        const len = String(arr[i]).length;
        if (len > limit) {
          violations.push(`${field}[${i + 1}]: ${len} chars (max ${limit})`);
        }
      }
    }
    const valid = violations.length === 0;
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            valid,
            violations,
            message: valid ? "All items within limits." : `Violations: ${violations.join("; ")}`,
          }),
        },
      ],
    };
  }
);

/** Export Google Ads RSA to CSV format */
const exportGoogleAdsCsvTool = tool(
  "export_google_ads_csv",
  "Exports Google Ads RSA copy (headlines, descriptions) to CSV format. Pass copy_data and optional campaign name.",
  z.object({
    copy_data: z.object({
      headlines: z.array(z.string()),
      descriptions: z.array(z.string()),
    }),
    campaign_name: z.string().optional(),
  }),
  async (args) => {
    const csv = buildCsvForPlatform(
      "google_ads_rsa",
      { headlines: args.copy_data.headlines, descriptions: args.copy_data.descriptions },
      args.campaign_name || "Campaign"
    );
    return { content: [{ type: "text" as const, text: csv }] };
  }
);

/** Export Meta Ads to CSV format */
const exportMetaAdsCsvTool = tool(
  "export_meta_ads_csv",
  "Exports Meta Ads copy (primary_text, headlines, descriptions) to CSV format.",
  z.object({
    copy_data: z.object({
      primary_text: z.array(z.string()).optional(),
      headlines: z.array(z.string()).optional(),
      descriptions: z.array(z.string()).optional(),
    }),
    campaign_name: z.string().optional(),
  }),
  async (args) => {
    const csv = buildCsvForPlatform(
      "meta_ads",
      {
        primary_text: args.copy_data.primary_text || [],
        headlines: args.copy_data.headlines || [],
        descriptions: args.copy_data.descriptions || [],
      },
      args.campaign_name || "Campaign"
    );
    return { content: [{ type: "text" as const, text: csv }] };
  }
);

/** Export LinkedIn Ads to CSV format */
const exportLinkedInAdsCsvTool = tool(
  "export_linkedin_ads_csv",
  "Exports LinkedIn Ads copy (introductory_text, headlines, descriptions) to CSV format.",
  z.object({
    copy_data: z.object({
      introductory_text: z.array(z.string()).optional(),
      headlines: z.array(z.string()).optional(),
      descriptions: z.array(z.string()).optional(),
    }),
    campaign_name: z.string().optional(),
  }),
  async (args) => {
    const csv = buildCsvForPlatform(
      "linkedin_ads",
      {
        introductory_text: args.copy_data.introductory_text || [],
        headlines: args.copy_data.headlines || [],
        descriptions: args.copy_data.descriptions || [],
      },
      args.campaign_name || "Campaign"
    );
    return { content: [{ type: "text" as const, text: csv }] };
  }
);

/** Export X (Twitter) Ads to CSV format */
const exportXAdsCsvTool = tool(
  "export_x_ads_csv",
  "Exports X (Twitter) Ads copy (tweet_text, card_headlines) to CSV format.",
  z.object({
    copy_data: z.object({
      tweet_text: z.array(z.string()).optional(),
      card_headlines: z.array(z.string()).optional(),
    }),
    campaign_name: z.string().optional(),
  }),
  async (args) => {
    const csv = buildCsvForPlatform(
      "x_ads",
      {
        tweet_text: args.copy_data.tweet_text || [],
        card_headlines: args.copy_data.card_headlines || [],
      },
      args.campaign_name || "Campaign"
    );
    return { content: [{ type: "text" as const, text: csv }] };
  }
);

/** Create the ad-tools MCP server */
export function createAdToolsMcpServer() {
  return createSdkMcpServer({
    name: "ad-tools",
    version: "1.0.0",
    tools: [
      validateCharacterLimitsTool,
      exportGoogleAdsCsvTool,
      exportMetaAdsCsvTool,
      exportLinkedInAdsCsvTool,
      exportXAdsCsvTool,
    ],
  });
}
