/**
 * Parse CSV and map columns to ABM form fields.
 * Supports headers: company, company name, organization, industry, role, target role, contacts, key contacts
 */

export type CSVAccountRow = {
  companyName: string;
  industry: string;
  targetRole: string;
  keyContacts: string;
};

const COLUMN_ALIASES: Record<string, keyof CSVAccountRow> = {
  company: "companyName",
  "company name": "companyName",
  organization: "companyName",
  account: "companyName",
  "account name": "companyName",
  industry: "industry",
  sector: "industry",
  role: "targetRole",
  "target role": "targetRole",
  "target role(s)": "targetRole",
  title: "targetRole",
  persona: "targetRole",
  contacts: "keyContacts",
  "key contacts": "keyContacts",
  "key contact": "keyContacts",
  context: "keyContacts",
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

export function parseABMCSV(text: string): CSVAccountRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = parseCSVLine(lines[0]);
  const headers = headerLine.map(normalizeHeader);

  const columnMap: Partial<Record<keyof CSVAccountRow, number>> = {};
  headers.forEach((h, i) => {
    const key = COLUMN_ALIASES[h];
    if (key && columnMap[key] === undefined) {
      columnMap[key] = i;
    }
  });

  // Fallback: if no company column found, use first column
  if (columnMap.companyName === undefined && headerLine.length > 0) {
    columnMap.companyName = 0;
  }

  const rows: CSVAccountRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVAccountRow = {
      companyName: columnMap.companyName !== undefined ? (values[columnMap.companyName] ?? "").trim() : "",
      industry: columnMap.industry !== undefined ? (values[columnMap.industry] ?? "").trim() : "",
      targetRole: columnMap.targetRole !== undefined ? (values[columnMap.targetRole] ?? "").trim() : "",
      keyContacts: columnMap.keyContacts !== undefined ? (values[columnMap.keyContacts] ?? "").trim() : "",
    };
    if (row.companyName) {
      rows.push(row);
    }
  }
  return rows;
}
