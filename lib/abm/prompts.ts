/**
 * Prompts for ABM generation (account brief, outreach, sequences).
 */

export type ABMBrief = {
  companyName: string;
  industry?: string;
  targetRole?: string;
  keyContacts?: string;
  productOrService: string;
  valueProposition: string;
  brandVoice?: string;
  additionalContext?: string;
};

export function getABMPrompt(brief: ABMBrief): string {
  const parts: string[] = [
    `Generate an ABM output for the following target account.`,
    ``,
    `**Company:** ${brief.companyName}`,
    brief.industry ? `**Industry:** ${brief.industry}` : "",
    brief.targetRole ? `**Target role(s):** ${brief.targetRole}` : "",
    brief.keyContacts ? `**Key contacts / context:** ${brief.keyContacts}` : "",
    ``,
    `**Your product/service:** ${brief.productOrService}`,
    `**Value proposition:** ${brief.valueProposition}`,
    brief.brandVoice ? `**Brand voice:** ${brief.brandVoice}` : "",
    brief.additionalContext ? `**Additional context:** ${brief.additionalContext}` : "",
    ``,
    `Return a JSON object in a code block with this structure:`,
    `\`\`\`json`,
    `{`,
    `  "accountBrief": {`,
    `    "companyOverview": "2-4 sentences on what they do, size, market position",`,
    `    "painPoints": ["pain 1", "pain 2", "pain 3"],`,
    `    "buyingSignals": ["signal 1", "signal 2"],`,
    `    "keyPersonas": ["role: focus", "role: focus"]`,
    `  },`,
    `  "emailOutreach": {`,
    `    "subject": "Subject line (max ~50 chars)",`,
    `    "body": "Email body, 100-200 words, value-first"`,
    `  },`,
    `  "linkedInOutreach": {`,
    `    "connectionRequest": "Max 300 chars, one specific hook",`,
    `    "followUpMessage": "2-4 short paragraphs, conversational"`,
    `  }`,
    `}`,
    `\`\`\``,
    ``,
    `Apply ABM best practices from the Skill. Be specific to this account, not generic.`,
  ];

  return parts.filter(Boolean).join("\n");
}
