import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { dateLabel, frameworkDisplay, money, organisationName, primaryAward, supplierName } from '@/components/reconciliation/format';
import { dueNowRebate, issueForFinding, lifetimeRebate, type OpportunityIssue, opportunityIssueMeta, reviewStatusLabels } from '@/components/reconciliation/opportunityModel';
import { OpportunityReviewStatus, ReconciliationFindingRecord } from '@/components/reconciliation/types';
import {
  readLatestReconciliationFindingsForMonth,
  readReconciliationFindings,
  resolveDefaultDashboardMonth,
  resolveReconciliationRun,
} from '@/lib/reconciliation/findingsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RollupKey = 'issue' | 'status' | 'buyer' | 'supplier' | 'framework';

interface ReportFilters {
  buyer: string | null;
  supplier: string | null;
  framework: string | null;
  issue: OpportunityIssue | null;
  status: OpportunityReviewStatus | null;
  dateFrom: string | null;
  dateTo: string | null;
}

interface ReportRollup {
  key: string;
  label: string;
  opportunities: number;
  due_now: number;
  lifetime_estimate: number;
  award_value: number;
}

const statusOrder: OpportunityReviewStatus[] = ['new', 'acknowledged', 'in_review', 'outreach_sent', 'resolved', 'not_relevant'];
const issueValues = Object.keys(opportunityIssueMeta) as OpportunityIssue[];
const brand = {
  darkBlue: [0, 0, 70] as const,
  blue: [15, 53, 184] as const,
  electricBlue: [0, 115, 255] as const,
  cyan: [0, 211, 255] as const,
  turquoise: [143, 254, 255] as const,
  paleGrey: [245, 245, 245] as const,
  lightGrey: [200, 200, 200] as const,
  grey: [100, 100, 100] as const,
  white: [255, 255, 255] as const,
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value && allowed.includes(value as T) ? value as T : null;
}

function filterValue(request: NextRequest, key: string): string | null {
  const value = request.nextUrl.searchParams.get(key)?.trim();
  return value && value !== 'all' ? value : null;
}

function reportFilters(request: NextRequest): ReportFilters {
  return {
    buyer: filterValue(request, 'buyer'),
    supplier: filterValue(request, 'supplier'),
    framework: filterValue(request, 'framework'),
    issue: oneOf(filterValue(request, 'issue'), issueValues),
    status: oneOf(filterValue(request, 'status'), statusOrder),
    dateFrom: filterValue(request, 'date_from'),
    dateTo: filterValue(request, 'date_to'),
  };
}

function dateValue(value: string | null | undefined, endOfDay = false): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function findingMatchesFilters(finding: ReconciliationFindingRecord, filters: ReportFilters): boolean {
  const framework = frameworkDisplay(finding);
  const frameworkKey = framework.reference ?? framework.name ?? 'Unresolved';
  const status = finding.opportunity_review?.status ?? 'new';
  const issue = issueForFinding(finding);
  const published = dateValue(primaryAward(finding)?.publication_date);
  const from = dateValue(filters.dateFrom);
  const to = dateValue(filters.dateTo, true);
  return (!filters.buyer || organisationName(finding) === filters.buyer) &&
    (!filters.supplier || supplierName(finding) === filters.supplier) &&
    (!filters.framework || frameworkKey === filters.framework) &&
    (!filters.issue || issue === filters.issue) &&
    (!filters.status || status === filters.status) &&
    (!from || (published !== null && published >= from)) &&
    (!to || (published !== null && published <= to));
}

function filterSummary(filters: ReportFilters): string {
  const parts = [
    filters.buyer ? `Buyer: ${filters.buyer}` : null,
    filters.supplier ? `Supplier: ${filters.supplier}` : null,
    filters.framework ? `Framework: ${filters.framework}` : null,
    filters.issue ? `Issue: ${opportunityIssueMeta[filters.issue].label}` : null,
    filters.status ? `Status: ${reviewStatusLabels[filters.status]}` : null,
    filters.dateFrom ? `From: ${filters.dateFrom}` : null,
    filters.dateTo ? `To: ${filters.dateTo}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : 'All available opportunities';
}

function addRollup(map: Map<string, ReportRollup>, key: string, label: string, finding: ReconciliationFindingRecord) {
  const row = map.get(key) ?? { key, label, opportunities: 0, due_now: 0, lifetime_estimate: 0, award_value: 0 };
  row.opportunities += 1;
  row.due_now += dueNowRebate(finding);
  row.lifetime_estimate += lifetimeRebate(finding);
  row.award_value += finding.award_contract_value ?? 0;
  map.set(key, row);
}

function buildRollup(findings: ReconciliationFindingRecord[], key: RollupKey): ReportRollup[] {
  const map = new Map<string, ReportRollup>();
  for (const finding of findings) {
    if (key === 'issue') {
      const issue = issueForFinding(finding);
      addRollup(map, issue, opportunityIssueMeta[issue].label, finding);
    }
    if (key === 'status') {
      const status = finding.opportunity_review?.status ?? 'new';
      addRollup(map, status, reviewStatusLabels[status], finding);
    }
    if (key === 'buyer') addRollup(map, organisationName(finding), organisationName(finding), finding);
    if (key === 'supplier') addRollup(map, supplierName(finding), supplierName(finding), finding);
    if (key === 'framework') {
      const framework = frameworkDisplay(finding);
      addRollup(map, framework.reference ?? 'unresolved', framework.reference ? `${framework.reference}${framework.name ? ` - ${framework.name}` : ''}` : 'Unresolved framework', finding);
    }
  }
  const rows = [...map.values()].sort((a, b) => b.due_now - a.due_now);
  if (key !== 'status') return rows;
  return statusOrder.map(status => map.get(status) ?? {
    key: status,
    label: reviewStatusLabels[status],
    opportunities: 0,
    due_now: 0,
    lifetime_estimate: 0,
    award_value: 0,
  });
}

async function loadReportData(request: NextRequest): Promise<{ runLabel: string; findings: ReconciliationFindingRecord[] }> {
  const requestedRunId = request.nextUrl.searchParams.get('run_id') || process.env.RECONCILIATION_DASHBOARD_RUN_ID;
  const run = await resolveReconciliationRun(requestedRunId || undefined);
  if (!run) return { runLabel: 'No run', findings: [] };
  const defaultMonth = await resolveDefaultDashboardMonth();
  const monthDate = new Date(Date.UTC(defaultMonth.year, defaultMonth.month - 1, 1));
  const result = requestedRunId
    ? await readReconciliationFindings(run.id, { limit: 1000, offset: 0 })
    : await readLatestReconciliationFindingsForMonth(
      defaultMonth.year,
      defaultMonth.month,
    );
  return {
    runLabel: `${run.id.slice(0, 8)} / ${monthDate.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
    findings: JSON.parse(JSON.stringify(result.findings)) as ReconciliationFindingRecord[],
  };
}

function opportunityRows(findings: ReconciliationFindingRecord[]) {
  return findings.map(finding => {
    const award = finding.external_awards[0] ?? null;
    const framework = frameworkDisplay(finding);
    const issue = issueForFinding(finding);
    const status = finding.opportunity_review?.status ?? 'new';
    return {
      Buyer: organisationName(finding),
      Supplier: supplierName(finding),
      Framework: framework.reference ?? '',
      'Framework name': framework.name ?? '',
      Issue: opportunityIssueMeta[issue].label,
      Status: reviewStatusLabels[status],
      Published: dateLabel(award?.publication_date),
      'Award date': dateLabel(award?.award_date),
      'Award value': finding.award_contract_value ?? award?.award_value ?? 0,
      'Due now rebate': dueNowRebate(finding),
      'Lifetime estimate': lifetimeRebate(finding),
      'Buyer evidence': finding.buyer_evidence?.verdict ?? '',
      'Supplier evidence': finding.supplier_evidence?.verdict ?? '',
      'Award evidence': award?.evidence_excerpt ?? finding.explanation,
      'Source URL': award?.source_url ?? '',
    };
  });
}

function setSheetWidths(sheet: XLSX.WorkSheet, widths: number[]) {
  sheet['!cols'] = widths.map(width => ({ wch: width }));
}

function sheetFromJson<T extends object>(rows: T[], widths: number[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.json_to_sheet(rows);
  setSheetWidths(sheet, widths);
  return sheet;
}

function workbookBuffer(findings: ReconciliationFindingRecord[], runLabel: string, filters: ReportFilters): Buffer {
  const dueNow = findings.reduce((sum, finding) => sum + dueNowRebate(finding), 0);
  const lifetime = findings.reduce((sum, finding) => sum + lifetimeRebate(finding), 0);
  const awardValue = findings.reduce((sum, finding) => sum + (finding.award_contract_value ?? 0), 0);
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: 'Rebate Intelligence Report',
    Subject: 'Award-to-rebate control report',
    Author: 'Commercial Services Group',
    Company: 'Commercial Services Group',
    CreatedDate: new Date(),
  };
  const summary = [
    { Field: 'Commercial Services Group', Value: 'Creating impact' },
    { Field: 'Report', Value: 'Rebate Intelligence Report' },
    { Field: 'Run / period', Value: runLabel },
    { Field: 'Scope', Value: filterSummary(filters) },
    { Field: 'Opportunities', Value: findings.length },
    { Field: 'Due now rebate', Value: dueNow },
    { Field: 'Lifetime estimate', Value: lifetime },
    { Field: 'Award value reviewed', Value: awardValue },
    { Field: 'Brand note', Value: 'Dark blue and white are the core colours; electric blue and cyan are highlight colours; data visualisation uses the blue-led palette.' },
  ];
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(summary, [28, 90]), 'Report Summary');
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(opportunityRows(findings), [30, 28, 14, 34, 24, 18, 14, 14, 14, 16, 18, 18, 18, 80, 50]), 'Opportunities');
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(buildRollup(findings, 'status'), [18, 24, 14, 16, 18, 18]), 'Status');
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(buildRollup(findings, 'issue'), [24, 28, 14, 16, 18, 18]), 'Issues');
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(buildRollup(findings, 'buyer'), [42, 42, 14, 16, 18, 18]), 'Customers');
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(buildRollup(findings, 'supplier'), [42, 42, 14, 16, 18, 18]), 'Suppliers');
  XLSX.utils.book_append_sheet(workbook, sheetFromJson(buildRollup(findings, 'framework'), [22, 48, 14, 16, 18, 18]), 'Frameworks');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function pdfEscape(value: string): string {
  return value
    .replace(/£/g, 'GBP ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrap(value: string, width = 88): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function pdfColour(colour: readonly [number, number, number]): string {
  return colour.map(value => (value / 255).toFixed(4)).join(' ');
}

class BrandedPdf {
  private readonly pageWidth = 595;
  private readonly pageHeight = 842;
  private readonly margin = 42;
  private readonly headerHeight = 104;
  private readonly footerHeight = 42;
  private pages: string[] = [];
  private commands = '';
  private y = 0;

  constructor(private readonly runLabel: string, private readonly scope: string) {
    this.newPage();
  }

  private newPage() {
    if (this.commands) this.commitPage();
    this.commands = '';
    this.header();
    this.y = this.pageHeight - this.headerHeight - 28;
  }

  private commitPage() {
    this.footer(this.pages.length + 1);
    this.pages.push(this.commands);
    this.commands = '';
  }

  private rect(x: number, y: number, width: number, height: number, fill: readonly [number, number, number]) {
    this.commands += `q ${pdfColour(fill)} rg ${x} ${y} ${width} ${height} re f Q\n`;
  }

  private line(x1: number, y1: number, x2: number, y2: number, colour: readonly [number, number, number], width = 1) {
    this.commands += `q ${pdfColour(colour)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q\n`;
  }

  private text(value: string, x: number, y: number, options: { size?: number; bold?: boolean; colour?: readonly [number, number, number] } = {}) {
    const size = options.size ?? 10;
    const font = options.bold ? 'F2' : 'F1';
    const colour = options.colour ?? brand.darkBlue;
    this.commands += `BT ${pdfColour(colour)} rg /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET\n`;
  }

  private wrappedText(value: string, x: number, width: number, size = 9, colour: readonly [number, number, number] = brand.grey, bold = false) {
    const maxChars = Math.max(20, Math.floor(width / (size * 0.48)));
    for (const line of wrap(value, maxChars)) {
      this.ensure(size + 5);
      this.text(line, x, this.y, { size, colour, bold });
      this.y -= size + 5;
    }
  }

  private header() {
    this.rect(0, this.pageHeight - this.headerHeight, this.pageWidth, this.headerHeight, brand.darkBlue);
    this.rect(0, this.pageHeight - this.headerHeight, 8, this.headerHeight, brand.electricBlue);
    this.text('Commercial Services Group', this.margin, this.pageHeight - 38, { size: 14, bold: true, colour: brand.white });
    this.text('Creating impact', this.margin, this.pageHeight - 58, { size: 10, colour: brand.cyan });
    this.text('REBATE INTELLIGENCE REPORT', this.margin, this.pageHeight - 84, { size: 20, bold: true, colour: brand.white });
    this.text(this.runLabel, this.pageWidth - 210, this.pageHeight - 38, { size: 9, colour: brand.white });
    this.text(new Date().toLocaleString('en-GB'), this.pageWidth - 210, this.pageHeight - 56, { size: 8, colour: brand.cyan });
  }

  private footer(pageNumber: number) {
    this.line(this.margin, this.footerHeight, this.pageWidth - this.margin, this.footerHeight, brand.lightGrey, 0.5);
    this.text('Commercial Services Group', this.margin, 24, { size: 8, bold: true, colour: brand.darkBlue });
    this.text('Report generated from persisted reconciliation evidence', this.margin + 132, 24, { size: 8, colour: brand.grey });
    this.text(`Page ${pageNumber}`, this.pageWidth - this.margin - 38, 24, { size: 8, colour: brand.grey });
  }

  private ensure(height: number) {
    if (this.y - height < this.footerHeight + 28) this.newPage();
  }

  intro() {
    this.sectionHeading('Scope');
    this.wrappedText(this.scope, this.margin, this.pageWidth - this.margin * 2, 9, brand.grey);
    this.y -= 8;
  }

  sectionHeading(title: string) {
    this.ensure(36);
    this.text(title.toUpperCase(), this.margin, this.y, { size: 11, bold: true, colour: brand.electricBlue });
    this.line(this.margin, this.y - 7, this.pageWidth - this.margin, this.y - 7, brand.cyan, 1.2);
    this.y -= 24;
  }

  kpis(items: Array<{ label: string; value: string; hint: string }>) {
    this.ensure(94);
    const gap = 10;
    const width = (this.pageWidth - this.margin * 2 - gap * (items.length - 1)) / items.length;
    const top = this.y;
    items.forEach((item, index) => {
      const x = this.margin + index * (width + gap);
      this.rect(x, top - 74, width, 74, brand.paleGrey);
      this.rect(x, top - 74, 4, 74, index === 0 ? brand.electricBlue : index === 1 ? brand.cyan : brand.blue);
      this.text(item.label.toUpperCase(), x + 12, top - 20, { size: 7, bold: true, colour: brand.grey });
      this.text(item.value, x + 12, top - 43, { size: 13, bold: true, colour: brand.darkBlue });
      this.text(item.hint, x + 12, top - 61, { size: 7, colour: brand.grey });
    });
    this.y -= 96;
  }

  rollupTable(title: string, rows: ReportRollup[], limit = 8) {
    this.sectionHeading(title);
    const visible = rows.slice(0, limit);
    const cols = [
      { label: 'Name', width: 235 },
      { label: 'Opps', width: 42 },
      { label: 'Due now', width: 82 },
      { label: 'Lifetime', width: 82 },
      { label: 'Award value', width: 82 },
    ];
    this.ensure(26 + visible.length * 24);
    let x = this.margin;
    this.rect(this.margin, this.y - 18, this.pageWidth - this.margin * 2, 22, brand.darkBlue);
    for (const col of cols) {
      this.text(col.label, x + 4, this.y - 10, { size: 7, bold: true, colour: brand.white });
      x += col.width;
    }
    this.y -= 26;
    for (const [index, row] of visible.entries()) {
      this.ensure(24);
      if (index % 2 === 0) this.rect(this.margin, this.y - 14, this.pageWidth - this.margin * 2, 20, brand.paleGrey);
      const values = [
        row.label.length > 54 ? `${row.label.slice(0, 51)}...` : row.label,
        String(row.opportunities),
        money(row.due_now),
        money(row.lifetime_estimate),
        money(row.award_value),
      ];
      x = this.margin;
      values.forEach((value, colIndex) => {
        this.text(value, x + 4, this.y - 8, { size: colIndex === 0 ? 7.5 : 7, bold: colIndex === 2, colour: colIndex === 2 ? brand.darkBlue : brand.grey });
        x += cols[colIndex].width;
      });
      this.y -= 22;
    }
    if (!visible.length) {
      this.wrappedText('No opportunities match this report scope.', this.margin, this.pageWidth - this.margin * 2, 9, brand.grey);
    }
    this.y -= 10;
  }

  opportunityHighlights(findings: ReconciliationFindingRecord[]) {
    this.sectionHeading('Opportunity highlights');
    for (const finding of findings.slice(0, 8)) {
      this.ensure(52);
      const framework = frameworkDisplay(finding);
      const issue = issueForFinding(finding);
      const title = `${organisationName(finding)} / ${supplierName(finding)}`;
      this.text(title.length > 72 ? `${title.slice(0, 69)}...` : title, this.margin, this.y, { size: 9, bold: true, colour: brand.darkBlue });
      this.text(`${framework.reference ?? 'Unresolved'} | ${opportunityIssueMeta[issue].label} | ${money(dueNowRebate(finding))} due now`, this.margin, this.y - 15, { size: 8, colour: brand.grey });
      this.line(this.margin, this.y - 25, this.pageWidth - this.margin, this.y - 25, brand.lightGrey, 0.4);
      this.y -= 38;
    }
  }

  finish(): Buffer {
    if (this.commands) this.commitPage();
    return pdfObjects(this.pages, this.pageWidth, this.pageHeight);
  }
}

function pdfObjects(pages: string[], pageWidth: number, pageHeight: number): Buffer {
  if (!pages.length) pages.push('');

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageRefs: number[] = [];
  let nextObject = 5;
  for (const content of pages) {
    const pageObject = nextObject++;
    const contentObject = nextObject++;
    pageRefs.push(pageObject);
    objects[pageObject - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject - 1] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`;
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function reportPdf(runLabel: string, findings: ReconciliationFindingRecord[], filters: ReportFilters): Buffer {
  const dueNow = findings.reduce((sum, finding) => sum + dueNowRebate(finding), 0);
  const lifetime = findings.reduce((sum, finding) => sum + lifetimeRebate(finding), 0);
  const awardValue = findings.reduce((sum, finding) => sum + (finding.award_contract_value ?? 0), 0);
  const pdf = new BrandedPdf(runLabel, filterSummary(filters));
  pdf.intro();
  pdf.kpis([
    { label: 'Due now', value: money(dueNow), hint: 'Confirmed missing rebate' },
    { label: 'Lifetime estimate', value: money(lifetime), hint: 'Full opportunity value' },
    { label: 'Award value reviewed', value: money(awardValue), hint: `${findings.length} opportunities` },
  ]);
  pdf.rollupTable('Workflow status', buildRollup(findings, 'status'), 6);
  pdf.rollupTable('Issue breakdown', buildRollup(findings, 'issue'), 6);
  pdf.rollupTable('Top customers', buildRollup(findings, 'buyer'), 8);
  pdf.rollupTable('Top suppliers', buildRollup(findings, 'supplier'), 8);
  pdf.rollupTable('Top frameworks', buildRollup(findings, 'framework'), 8);
  pdf.opportunityHighlights(findings);
  return pdf.finish();
}

function responseBody(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') ?? 'xlsx';
  const filters = reportFilters(request);
  const { runLabel, findings } = await loadReportData(request);
  const scopedFindings = findings.filter(finding => findingMatchesFilters(finding, filters));
  if (format === 'pdf') {
    return new NextResponse(responseBody(reportPdf(runLabel, scopedFindings, filters)), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="rebate-intelligence-report.pdf"',
      },
    });
  }
  return new NextResponse(responseBody(workbookBuffer(scopedFindings, runLabel, filters)), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="rebate-intelligence-report.xlsx"',
    },
  });
}
