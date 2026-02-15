/**
 * MCP tools for AdCopy Pro: validation and CSV export.
 * Shared across all ad channels; inputs are platform-specific.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

function escapeCsvCell(value: string): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
    const { copy_data, campaign_name } = args;
    const campaign = campaign_name || "Campaign";
    const headers = [
      "Campaign",
      ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
    ];
    const row = [
      campaign,
      ...(copy_data.headlines || []).slice(0, 15),
      ...(copy_data.descriptions || []).slice(0, 4),
    ];
    const csv = [headers.map(escapeCsvCell).join(","), row.map(escapeCsvCell).join(",")].join("\r\n");
    return {
      content: [{ type: "text" as const, text: csv }],
    };
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
    const { copy_data, campaign_name } = args;
    const campaign = campaign_name || "Campaign";
    const p = (copy_data.primary_text || []).slice(0, 5);
    const h = (copy_data.headlines || []).slice(0, 5);
    const d = (copy_data.descriptions || []).slice(0, 5);
    const headers = [
      "Campaign",
      ...Array.from({ length: 5 }, (_, i) => `Primary Text ${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `Headline ${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `Description ${i + 1}`),
    ];
    const row = [campaign, ...p, ...h, ...d];
    const csv = [headers.map(escapeCsvCell).join(","), row.map(escapeCsvCell).join(",")].join("\r\n");
    return {
      content: [{ type: "text" as const, text: csv }],
    };
  }
);

/** Create the ad-tools MCP server */
export function createAdToolsMcpServer() {
  return createSdkMcpServer({
    name: "ad-tools",
    version: "1.0.0",
    tools: [validateCharacterLimitsTool, exportGoogleAdsCsvTool, exportMetaAdsCsvTool],
  });
}
