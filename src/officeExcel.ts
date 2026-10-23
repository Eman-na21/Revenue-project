import { OfficeRevenue, RevenueCode } from '@/office';

/**
 * Texts of the report. Change them here if the office wants other words.
 */
const OFFICE_NAME_AM = 'ቃሉ ወረዳ ገቢዎች ጽ/ቤት';
const HEADER_CODE = 'ኮድ';
const HEADER_REVENUE = 'ገቢ';
const HEADER_REMARK = 'ምርመራ'; // third column, left empty like in the office's sheet
const TOTAL_LABEL = 'ድምር';

/** Orange of the title row. */
const TITLE_FILL = '#E36C0A';

/** The dates the administrator chose, e.g. "ከ2026-10-11 እስከ 2026-11-09". */
const periodText = (rangeStart: string, rangeEnd: string): string => `ከ${rangeStart} እስከ ${rangeEnd}`;

/** Title of the report for the dates the administrator chose, e.g. "ቃሉ ወረዳ ገቢዎች ጽ/ቤት ከ2026-10-11 እስከ 2026-11-09". */
export const officeReportTitle = (rangeStart: string, rangeEnd: string): string =>
  `${OFFICE_NAME_AM} ${periodText(rangeStart, rangeEnd)}`;

/**
 * Excel report of the OFFICE revenue (entered by the accountant) for the dates the administrator chose,
 * in the layout the office uses:
 *
 *   [ orange title: office name ]
 *   [ orange title: From / To dates ]
 *   ኮድ | ገቢ | (remark)
 *   one row for EVERY revenue code (empty cell when nothing was received for that code)
 *   ድምር | total
 *
 * It is a separate report from the agents' performance report: the two are never merged.
 * Same approach as reportExcel.ts: an HTML table that Excel opens as a .xls file.
 */
export function downloadOfficeExcel(items: OfficeRevenue[], codes: RevenueCode[], rangeStart: string, rangeEnd: string) {
  const escapeCell = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const inRange = items.filter((item) => item.date >= rangeStart && item.date <= rangeEnd);

  // Every code the office knows, plus any code that has revenue in this period (even if it was switched off later).
  const codeList = Array.from(new Set([...codes.map((item) => item.code), ...inRange.map((item) => item.code)])).sort();

  const totals = new Map<string, number>();
  for (const item of inRange) totals.set(item.code, (totals.get(item.code) ?? 0) + (Number(item.amount) || 0));
  const grandTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);

  // Borders, colours and alignment are written as plain HTML attributes (not only in the style sheet)
  // so that both Excel and LibreOffice show them.
  const CODE_W = 90;
  const AMOUNT_W = 260;
  const numberStyle = "mso-number-format:'#,##0.00'";

  const amountCell = (value: number | undefined) =>
    value === undefined || value === 0
      ? `<td align="right" width="${AMOUNT_W}">&nbsp;</td>`
      : `<td align="right" width="${AMOUNT_W}" style="${numberStyle}">${value.toFixed(2)}</td>`;

  const rows = codeList
    .map(
      (code) => `
        <tr>
          <td align="center" width="${CODE_W}"><b>${escapeCell(code)}</b></td>
          ${amountCell(totals.get(code))}
          <td width="${AMOUNT_W}">&nbsp;</td>
        </tr>`,
    )
    .join('');

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Nyala, 'Abyssinica SIL', Calibri, Arial, sans-serif; color: #000000; margin: 18px; }
          table { font-family: Nyala, 'Abyssinica SIL', Calibri, Arial, sans-serif; }
          td { white-space: nowrap; font-size: 12pt; }
          .title { font-size: 13pt; padding: 5px 8px; }
        </style>
      </head>
      <body>
        <table border="1" cellspacing="0" cellpadding="3" style="border-collapse:collapse">
          <tr>
            <td colspan="3" align="center" bgcolor="${TITLE_FILL}" class="title"><b>${escapeCell(OFFICE_NAME_AM)}</b></td>
          </tr>
          <tr>
            <td colspan="3" align="center" bgcolor="${TITLE_FILL}" class="title"><b>${escapeCell(periodText(rangeStart, rangeEnd))}</b></td>
          </tr>
          <tr>
            <td align="center" width="${CODE_W}"><b>${HEADER_CODE}</b></td>
            <td align="center" width="${AMOUNT_W}"><b>${HEADER_REVENUE}</b></td>
            <td align="center" width="${AMOUNT_W}"><b>${HEADER_REMARK}</b></td>
          </tr>
          ${rows}
          <tr>
            <td align="center" width="${CODE_W}"><b>${TOTAL_LABEL}</b></td>
            <td align="right" width="${AMOUNT_W}" style="${numberStyle}"><b>${grandTotal.toFixed(2)}</b></td>
            <td width="${AMOUNT_W}">&nbsp;</td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `office-revenue-${rangeStart}-to-${rangeEnd}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
