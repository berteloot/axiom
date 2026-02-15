/**
 * Spreadsheet builder: deterministic Excel generation from research JSON.
 * No AI – pure exceljs from structured data.
 */

import ExcelJS from "exceljs";
import type {
  ResearchOutput,
  CompanyResearch,
  ResearchSignal,
  ActionPlanItem,
  SignalStrength,
} from "./types";
import { buildActionPlan } from "./research-agent";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2C5282" },
};
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };

const STRENGTH_COLORS: Record<SignalStrength, string> = {
  STRONG: "FF22C55E",
  MODERATE: "FFEAB308",
  WEAK: "FFF97316",
  NONE: "FFEF4444",
};

export async function buildResearchExcel(
  output: ResearchOutput
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Asset Organizer – Signal Research";
  workbook.created = new Date();

  const companies = [...output.companies].sort(
    (a, b) => b.overallScore - a.overallScore
  );
  const actionPlan = buildActionPlan(companies);

  // Sheet 1: Ranked Summary
  const wsSummary = workbook.addWorksheet("Ranked Summary");
  wsSummary.columns = [
    { width: 6 },
    { width: 22 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 18 },
    { width: 50 },
  ];
  const summaryHeaders = [
    "Rank",
    "Company",
    "Industry",
    "Revenue",
    "Employees",
    "Current System",
    "Opportunity Status",
    "Website",
    "Jobs",
    "Press",
    "Success Stories",
    "Forums",
    "Score",
    "Sales Opportunity",
    "Key Evidence",
  ];
  wsSummary.addRow(summaryHeaders);
  wsSummary.getRow(1).fill = HEADER_FILL;
  wsSummary.getRow(1).font = HEADER_FONT;

  const scoreToStatus = (s: number) =>
    s >= 8 ? "Hot" : s >= 6 ? "Warm" : s >= 4 ? "Nurture" : "Low";

  companies.forEach((c, i) => {
    const sigMap = Object.fromEntries(
      c.signals.map((s) => [s.category, s.strength])
    );
    wsSummary.addRow([
      i + 1,
      c.company,
      c.industry ?? "",
      c.revenue ?? "",
      c.employees ?? "",
      c.currentSystem ?? "",
      scoreToStatus(c.overallScore),
      sigMap.website ?? sigMap.Website ?? "",
      sigMap.job_postings ?? sigMap["job_postings"] ?? "",
      sigMap.press_news ?? sigMap["press_news"] ?? "",
      sigMap.partner_vendor ?? sigMap["partner_vendor"] ?? "",
      sigMap.forums_communities ?? sigMap["forums_communities"] ?? "",
      c.overallScore,
      c.salesOpportunity ?? "",
      c.keyEvidence ?? "",
    ]);
  });

  // Color signal strength cells (columns H–L)
  companies.forEach((_, i) => {
    const row = i + 2;
    [8, 9, 10, 11, 12].forEach((col) => {
      const cell = wsSummary.getCell(row, col);
      const val = cell.value?.toString() ?? "";
      const color = STRENGTH_COLORS[val as SignalStrength];
      if (color) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: color },
        };
      }
    });
  });

  // Sheet 2: Signal Detail
  const wsDetail = workbook.addWorksheet("Signal Detail");
  wsDetail.columns = [
    { width: 22 },
    { width: 18 },
    { width: 12 },
    { width: 60 },
    { width: 50 },
    { width: 40 },
    { width: 40 },
  ];
  wsDetail.addRow([
    "Company",
    "Signal Category",
    "Strength",
    "Key Evidence",
    "Source URLs",
    "Actionable Insight",
    "Recommended Next Step",
  ]);
  wsDetail.getRow(1).fill = HEADER_FILL;
  wsDetail.getRow(1).font = HEADER_FONT;

  companies.forEach((c) => {
    c.signals.forEach((s) => {
      const row = wsDetail.addRow([
        c.company,
        s.category,
        s.strength,
        s.keyEvidence,
        s.sourceUrls.join("; "),
        s.actionableInsight ?? "",
        s.recommendedNextStep ?? "",
      ]);
      const strengthCell = row.getCell(3);
      const color = STRENGTH_COLORS[s.strength];
      if (color) {
        strengthCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: color },
        };
      }
    });
  });

  // Sheet 3: Action Plan
  const wsAction = workbook.addWorksheet("Action Plan");
  wsAction.columns = [
    { width: 14 },
    { width: 22 },
    { width: 50 },
    { width: 30 },
    { width: 12 },
    { width: 50 },
  ];
  wsAction.addRow([
    "Priority",
    "Company",
    "Action",
    "Key Contact",
    "Timing",
    "Rationale",
  ]);
  wsAction.getRow(1).fill = HEADER_FILL;
  wsAction.getRow(1).font = HEADER_FONT;

  actionPlan.forEach((a) => {
    const row = wsAction.addRow([
      a.priority,
      a.company,
      a.action,
      a.keyContact ?? "",
      a.timing ?? "",
      a.rationale,
    ]);
    const priorityCell = row.getCell(1);
    const pColors: Record<string, string> = {
      "P1-HOT": "FFEF4444",
      "P2-WARM": "FFF97316",
      "P3-NURTURE": "FFEAB308",
      "P4-LOW": "FF94A3B8",
    };
    const pc = pColors[a.priority];
    if (pc) {
      priorityCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: pc },
      };
      priorityCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
