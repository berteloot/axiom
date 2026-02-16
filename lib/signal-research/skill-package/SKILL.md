---
name: signal-research
description: Sales intelligence research agent. Identifies buying signals from websites, forums, job postings, press, and partner sites for user-defined research focus.
---

# Signal Research – Sales Intelligence & Buying Signals

Use this skill when researching companies for buying signals. The research focus is **user-defined** (e.g. SAP transformation, AI adoption, cloud migration, ERP modernization). Apply web search to gather real evidence from multiple sources.

## Core Principles

- **Evidence-based**: Base all ratings on actual findings from web search. No assumptions or guesses.
- **Specific**: Cite real URLs, job titles, press mentions, forum posts. Avoid generic claims.
- **Structured**: Rate each signal category as STRONG, MODERATE, WEAK, or NONE. Provide key evidence.
- **Actionable**: Include recommended next steps and actionable insights per signal.

## Signal Categories

Research these five categories for each company:

1. **website**: Corporate site – About, News, Careers, product pages. Look for mentions of the research focus.
2. **job_postings**: Job boards (Indeed, LinkedIn Jobs, Glassdoor). Search "[company] jobs" + research keywords.
3. **press_news**: PR Newswire, company newsrooms, trade publications. "[company]" + research keywords.
4. **forums_communities**: Reddit (site:reddit.com), Glassdoor reviews, Spiceworks, tech communities. Employee mentions.
5. **partner_vendor**: Case studies, success stories, partner pages mentioning the company and research focus.

## Web Search Strategy

- **Company website**: Use the domain when provided. Check main pages and careers.
- **Job boards**: Search "[company] jobs [research focus]" and "[company] careers [keywords]".
- **Press**: Search "[company] [research focus]" for recent news and announcements.
- **Forums**: Use site:reddit.com "[company] [research focus]" for community discussions.
- **Partner/vendor**: Search for case studies or partner pages that mention the company.

## Strength Ratings

- **STRONG**: Multiple clear evidence points, recent activity, URLs to cite.
- **MODERATE**: Some evidence, could be stronger or more recent.
- **WEAK**: Minimal or indirect signals.
- **NONE**: No relevant evidence found; say so explicitly.

## Output Format

Return a valid JSON object in a code block. No other text before or after. Structure:

```json
{
  "company": "Company Name",
  "industry": "Industry",
  "revenue": "",
  "employees": "",
  "currentSystem": "",
  "overallScore": 7,
  "salesOpportunity": "Brief 1-2 sentence summary",
  "keyEvidence": "Top 1-2 evidence points",
  "keyDecisionMakers": [{"name": "Name", "title": "Title"}],
  "signals": [
    {
      "category": "website",
      "strength": "STRONG",
      "keyEvidence": "What you found",
      "sourceUrls": ["url1", "url2"],
      "actionableInsight": "What it means",
      "recommendedNextStep": "Suggested action"
    }
  ]
}
```

- Include **all 5 signal categories** in every response.
- `overallScore` is 1–10 based on aggregate signal strength.
- `sourceUrls` must be real, working URLs from web search.
- `salesOpportunity` summarizes the opportunity in 1–2 sentences.

## Quality Checklist

- [ ] All 5 signal categories present.
- [ ] Evidence is specific and cites real sources.
- [ ] sourceUrls are valid and relevant.
- [ ] overallScore reflects the evidence.
- [ ] No generic filler; research-backed only.
- [ ] Valid JSON in a code block, no extra text.
