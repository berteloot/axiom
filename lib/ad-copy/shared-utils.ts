/**
 * Shared utilities for ad copy generation.
 * Used by skills-enhanced, run-ad-copy-agent, and the generate API route.
 */

import type { PlatformConfig } from "./platforms";

export function truncateField(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 3) + "...";
}

/**
 * Parse raw JSON string from model response and truncate each field to platform limits.
 */
export function parseAndTruncateCopy(
  raw: string,
  platform: PlatformConfig
): Record<string, string[]> {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const result: Record<string, string[]> = {};
  for (const [fieldKey, spec] of Object.entries(platform.fields)) {
    const rawVal = parsed[fieldKey];
    if (!rawVal) continue;
    const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
    const strings = arr
      .filter((v): v is string => typeof v === "string")
      .map((s) => truncateField(s, spec.max_chars));
    result[fieldKey] = strings;
  }
  return result;
}

/** Default model for ad copy generation (single-call and skills-enhanced). */
export const AD_COPY_MODEL = "claude-sonnet-4-20250514";

/** Beta API brands for skills + code execution. */
export const BETA_BRANDS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
] as const;
