/**
 * Parse CSV for signal research. Understands contact-sheet and company-list formats.
 *
 * Company list (one row per company):
 *   Company, Domain, Industry, Key Contacts, Target Role
 *
 * Contact sheet (one row per contact, grouped by company):
 *   Company, First Name, Last Name, Job Title, Email, …
 *   or: Company, Contact Name, Title, …
 *   First/Last and Job Title are preferred when present; domain is derived from Email if missing.
 */

export type ResearchCSVRow = {
  company: string;
  domain?: string;
  industry?: string;
  keyContacts?: string;
  targetRole?: string;
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
  let keyContactsCol = -1;
  let targetRoleCol = -1;
  let contactNameCol = -1;
  let firstNameCol = -1;
  let lastNameCol = -1;
  let titleCol = -1;
  let emailCol = -1;

  const companyAliases = ["company", "company name", "organization", "account", "account name", "organisation"];
  const domainAliases = ["email domain", "domain", "company domain", "website"];
  const industryAliases = ["industry", "sector"];
  const keyContactsAliases = ["key contacts", "contacts", "key contact"];
  const targetRoleAliases = ["target role", "role", "persona"];
  const contactNameAliases = ["contact name", "full name", "name", "contact"];
  const firstNameAliases = ["first name", "firstname", "first"];
  const lastNameAliases = ["last name", "lastname", "last", "surname"];
  const titleAliases = ["title", "job title", "position", "role"];
  const emailAliases = ["email", "email address", "e-mail"];

  headers.forEach((h, i) => {
    if (companyAliases.includes(h) && companyCol < 0) companyCol = i;
    if (domainAliases.includes(h) && domainCol < 0) domainCol = i;
    if (industryAliases.includes(h) && industryCol < 0) industryCol = i;
    if (keyContactsAliases.includes(h) && keyContactsCol < 0) keyContactsCol = i;
    if (targetRoleAliases.includes(h) && targetRoleCol < 0) targetRoleCol = i;
    if (contactNameAliases.includes(h) && contactNameCol < 0) contactNameCol = i;
    if (firstNameAliases.includes(h) && firstNameCol < 0) firstNameCol = i;
    if (lastNameAliases.includes(h) && lastNameCol < 0) lastNameCol = i;
    if (titleAliases.includes(h) && titleCol < 0) titleCol = i;
    if (emailAliases.includes(h) && emailCol < 0) emailCol = i;
  });

  if (companyCol < 0 && domainCol < 0) companyCol = 0;

  const hasContactFields = contactNameCol >= 0 || firstNameCol >= 0 || lastNameCol >= 0;
  const isContactSheet = companyCol >= 0 && hasContactFields;
  const seen = new Set<string>();
  const rows: ResearchCSVRow[] = [];
  const companyMap = new Map<string, ResearchCSVRow>();

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    let company = companyCol >= 0 ? (values[companyCol] ?? "").trim() : "";
    let domain = domainCol >= 0 ? (values[domainCol] ?? "").trim().toLowerCase() : "";
    const emailRaw = emailCol >= 0 ? (values[emailCol] ?? "").trim() : "";
    if (emailRaw.includes("@") && !domain) {
      domain = emailRaw.slice(emailRaw.lastIndexOf("@") + 1).toLowerCase();
    }
    if (domain.includes("@")) {
      const at = domain.lastIndexOf("@");
      domain = domain.slice(at + 1);
    }
    const industry = industryCol >= 0 ? (values[industryCol] ?? "").trim() : undefined;
    const keyContactsRaw = keyContactsCol >= 0 ? (values[keyContactsCol] ?? "").trim() : "";
    const targetRole = targetRoleCol >= 0 ? (values[targetRoleCol] ?? "").trim() : undefined;
    const contactName = contactNameCol >= 0 ? (values[contactNameCol] ?? "").trim() : "";
    const firstName = firstNameCol >= 0 ? (values[firstNameCol] ?? "").trim() : "";
    const lastName = lastNameCol >= 0 ? (values[lastNameCol] ?? "").trim() : "";
    const jobTitle = titleCol >= 0 ? (values[titleCol] ?? "").trim() : "";

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

    if (isContactSheet) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || contactName;
      const contactStr = fullName
        ? (jobTitle ? `${fullName} (${jobTitle})` : fullName)
        : "";
      const existing = companyMap.get(key);
      if (existing) {
        if (contactStr) {
          existing.keyContacts = existing.keyContacts ? `${existing.keyContacts}; ${contactStr}` : contactStr;
        }
        if (targetRole && !existing.targetRole) existing.targetRole = targetRole;
        if (industry && !existing.industry) existing.industry = industry;
        if (domain && !existing.domain) existing.domain = domain;
      } else {
        companyMap.set(key, {
          company,
          domain: domain || undefined,
          industry: industry || undefined,
          keyContacts: contactStr,
          targetRole: targetRole || undefined,
        });
      }
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      company,
      domain: domain || undefined,
      industry: industry || undefined,
      keyContacts: keyContactsRaw || undefined,
      targetRole: targetRole || undefined,
    });
  }

  if (companyMap.size > 0) {
    return Array.from(companyMap.values());
  }

  return rows;
}
