#!/usr/bin/env npx tsx
/**
 * Upload the Signal Research skill to the Claude API and output the skill_id.
 * Set SIGNAL_RESEARCH_SKILL_ID in .env to use Skills-enhanced research.
 *
 * Run: npx tsx scripts/upload-signal-research-skill.ts
 */

import "dotenv/config";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const SKILL_DIR = path.join(__dirname, "../lib/signal-research/skill-package");

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to upload the skill.");
    process.exit(1);
  }

  const skillMdPath = path.join(SKILL_DIR, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    console.error(`SKILL.md not found at ${skillMdPath}`);
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  const file = await toFile(
    fs.createReadStream(skillMdPath),
    "signal-research/SKILL.md",
    { type: "text/markdown" }
  );

  try {
    const skill = await client.beta.skills.create({
      display_title: "Signal Research – Sales Intelligence & Buying Signals",
      files: [file],
      betas: ["skills-2025-10-02"],
    });

    console.log("\n✅ Signal Research skill uploaded successfully.\n");
    console.log("Add to your .env:");
    console.log(`SIGNAL_RESEARCH_SKILL_ID=${skill.id}\n`);
    console.log(`Skill ID: ${skill.id}`);
    console.log(`Latest version: ${skill.latest_version ?? "pending"}`);
  } catch (err) {
    console.error("Upload failed:", err);
    process.exit(1);
  }
}

main();
