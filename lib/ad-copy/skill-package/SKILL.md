---
name: ad-copy-pro
description: Expert ad copy generation for Google Ads RSA, Meta, LinkedIn, and X. Enforces character limits and brand voice.
---

# Ad Copy Pro – Multi-Platform RSA & Performance Ad Copy

Use this skill when generating ad copy for any ad platform. Apply platform-specific rules, character limits, and brand voice.

## Brand Voice (All Platforms)

- Clear, benefit-first, active voice.
- Honest urgency; avoid hype or false claims.
- Match the brand voice attributes provided in the brief.
- No generic marketing fluff; be specific and value-focused.

## Google Ads (Responsive Search Ad)

- **Headlines:** Max 30 characters each, including spaces. Generate exactly 15 unique headlines.
- **Descriptions:** Max 90 characters each. Generate exactly 4 unique descriptions.
- Front-load the most important words in headlines.
- Include primary keyword in 2–3 headlines; use keywords naturally in descriptions.
- Match searcher intent and landing page.
- No generic-only CTAs ("Learn More", "Click Here" alone).

## Meta Ads (Facebook & Instagram)

- **Primary text:** Max 125 chars. Lead with the hook.
- **Headlines:** Max 40 chars each. Punchy, benefit-led.
- **Descriptions:** Max 155 chars each. Conversational but conversion-focused.
- Use social proof and urgency where appropriate.

## LinkedIn Ads (Sponsored Content)

- **Introductory text:** Max 150 chars. Professional, B2B tone.
- **Headlines:** Max 70 chars. Authority and value-focused.
- **Descriptions:** Max 100 chars each. Professional but engaging. Speak to decision-makers.
- Emphasize ROI, efficiency, outcomes.

## X (Twitter) Ads

- **Tweet text:** Max 280 chars (standard tweet limit). Concise, punchy.
- **Card headlines:** Max 70 chars. For website cards.
- Conversational tone. Hashtags sparingly.
- Lead with the hook; CTA in the last line.

## Quality Checklist

- [ ] All items within character limits.
- [ ] No typos or grammar errors.
- [ ] CTA is clear and specific.
- [ ] Variations are unique (no duplicates).
- [ ] Keywords woven naturally.
- [ ] Brand tone and compliance respected.

## Output Format

Return a JSON object only, in a code block, with field names matching the platform (e.g. `headlines`, `descriptions` for Google Ads RSA). No other text before or after the JSON block.
