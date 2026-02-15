/**
 * Parse CSV for signal research. Supports:
 * - Company, Company Name, Organization
 * - Email Domain (extract unique companies, ignore vendor domains like sap.com)
 * - Industry
 */

export type ResearchCSVRow = {
  company: string;
  domain?: string;
  industry?: string;
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Convert domain (acme.com) to company name (Acme) */
function domainToCompanyName(domain: string): string {
  const base = domain.replace(/^www\./, "").split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Domains to skip (vendor/crawler sites) */
const SKIP_DOMAINS = new Set([
  "sap.com",
  "google.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "linkedin.com",
  "yahoo.com",
  "outlook.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
]);

export function parseResearchCSV(text: string): ResearchCSVRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = parseCSVLine(lines[0]);
  const headers = headerLine.map(normalizeHeader);

  let companyCol = -1;
  let domainCol = -1;
  let industryCol = -1;

  const companyAliases = ["company", "company name", "organization", "account", "account name"];
  const domainAliases = ["email domain", "domain", "company domain", "website"];
  const industryAliases = ["industry", "sector"];

  headers.forEach((h, i) => {
    if (companyAliases.includes(h) && companyCol < 0) companyCol = i;
    if (domainAliases.includes(h) && domainCol < 0) domainCol = i;
    if (industryAliases.includes(h) && industryCol < 0) industryCol = i;
  });

  if (companyCol < 0 && domainCol < 0) companyCol = 0;

  const seen = new Set<string>();
  const rows: ResearchCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    let company = companyCol >= 0 ? (values[companyCol] ?? "").trim() : "";
    let domain = domainCol >= 0 ? (values[domainCol] ?? "").trim().toLowerCase() : "";
    if (domain.includes("@")) {
      const at = domain.lastIndexOf("@");
      domain = domain.slice(at + 1);
    }
    const industry = industryCol >= 0 ? (values[industryCol] ?? "").trim() : undefined;

    if (domain && !company) {
      company = domainToCompanyName(domain);
    }
    if (!company && domain) {
      company = domain;
    }

    if (!company) continue;

    const normDomain = domain.replace(/^www\./, "");
    if (normDomain && SKIP_DOMAINS.has(normDomain)) continue;

    const key = `${company.toLowerCase()}|${normDomain || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      company,
      domain: domain || undefined,
      industry: industry || undefined,
    });
  }

  return rows;
}
