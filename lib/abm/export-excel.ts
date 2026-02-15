/**
 * Build an Excel workbook from ABM result with multiple tabs.
 */

import ExcelJS from "exceljs";
import type { ABMResult } from "./skills-enhanced";

export async function buildABMExcel(
  result: ABMResult,
  companyName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Asset Organizer – ABM Pro";
  workbook.created = new Date();

  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2C5282" },
  };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };

  // Tab 1: Account Brief
  const wsBrief = workbook.addWorksheet("Account Brief", {
    headerFooter: { firstHeader: "Account Brief" },
  });
  wsBrief.columns = [
    { width: 15 },
    { width: 80 },
  ];
  wsBrief.addRow(["Company", companyName]);
  wsBrief.addRow(["Overview", result.accountBrief.companyOverview]);
  wsBrief.addRow([]);
  wsBrief.getRow(1).font = { bold: true };
  wsBrief.getRow(2).font = { bold: true };
  wsBrief.getCell("A1").fill = headerFill;
  wsBrief.getCell("A1").font = headerFont;
  wsBrief.getCell("A2").fill = headerFill;
  wsBrief.getCell("A2").font = headerFont;

  // Tab 2: Pain Points
  const wsPain = workbook.addWorksheet("Pain Points");
  wsPain.columns = [{ width: 8 }, { width: 80 }];
  wsPain.addRow(["#", "Pain Point"]);
  wsPain.getRow(1).fill = headerFill;
  wsPain.getRow(1).font = headerFont;
  result.accountBrief.painPoints.forEach((p, i) => {
    wsPain.addRow([i + 1, p]);
  });

  // Tab 3: Buying Signals
  const wsSignals = workbook.addWorksheet("Buying Signals");
  wsSignals.columns = [{ width: 8 }, { width: 80 }];
  wsSignals.addRow(["#", "Signal"]);
  wsSignals.getRow(1).fill = headerFill;
  wsSignals.getRow(1).font = headerFont;
  result.accountBrief.buyingSignals.forEach((s, i) => {
    wsSignals.addRow([i + 1, s]);
  });

  // Tab 4: Key Personas
  const wsPersonas = workbook.addWorksheet("Key Personas");
  wsPersonas.columns = [{ width: 8 }, { width: 80 }];
  wsPersonas.addRow(["#", "Persona"]);
  wsPersonas.getRow(1).fill = headerFill;
  wsPersonas.getRow(1).font = headerFont;
  result.accountBrief.keyPersonas.forEach((p, i) => {
    wsPersonas.addRow([i + 1, p]);
  });

  // Tab 5: Email Outreach
  const wsEmail = workbook.addWorksheet("Email Outreach");
  wsEmail.columns = [{ width: 20 }, { width: 100 }];
  wsEmail.addRow(["Field", "Content"]);
  wsEmail.getRow(1).fill = headerFill;
  wsEmail.getRow(1).font = headerFont;
  wsEmail.addRow(["Subject", result.emailOutreach.subject]);
  wsEmail.addRow(["Body", result.emailOutreach.body]);
  wsEmail.getRow(2).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  wsEmail.getRow(2).getCell(1).font = { bold: true };
  wsEmail.getRow(3).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  wsEmail.getRow(3).getCell(1).font = { bold: true };

  // Tab 6: LinkedIn Outreach
  const wsLi = workbook.addWorksheet("LinkedIn Outreach");
  wsLi.columns = [{ width: 22 }, { width: 100 }];
  wsLi.addRow(["Field", "Content"]);
  wsLi.getRow(1).fill = headerFill;
  wsLi.getRow(1).font = headerFont;
  wsLi.addRow(["Connection Request", result.linkedInOutreach.connectionRequest]);
  wsLi.addRow(["Follow-up Message", result.linkedInOutreach.followUpMessage]);
  wsLi.getRow(2).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  wsLi.getRow(2).getCell(1).font = { bold: true };
  wsLi.getRow(3).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  wsLi.getRow(3).getCell(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
