import 'server-only';

import type {AdminRow} from './admin-data';

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvCell(value: unknown): string {
  return `"${scalar(value).replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows: AdminRow[], columns: readonly string[]): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}`;
}

function xml(value: unknown): string {
  return scalar(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function rowsToExcelXml(rows: AdminRow[], columns: readonly string[]): string {
  const row = (values: unknown[]) =>
    `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`).join('')}</Row>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Nexora"><Table>${row([...columns])}${rows
   .map((item) => row(columns.map((column) => item[column])))
   .join('')}</Table></Worksheet>
</Workbook>`;
}

export function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let quoted = false;
  const source = input.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      current.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      current.push(cell.trim());
      if (current.some(Boolean)) rows.push(current);
      current = [];
      cell = '';
    } else cell += character;
  }
  if (cell || current.length > 0) {
    current.push(cell.trim());
    rows.push(current);
  }
  const [headers, ...data] = rows;
  if (!headers) return [];
  return data.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  );
}

export function parseExcelXml(input: string): Record<string, string>[] {
  const rows = [...input.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/gi)].map((match) =>
    [...(match[1] ?? '').matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/gi)].map((cell) =>
      (cell[1] ?? '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&')
    )
  );
  const [headers, ...data] = rows;
  if (!headers) return [];
  return data.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  );
}
