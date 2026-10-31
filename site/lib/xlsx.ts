import { strFromU8, unzipSync } from "fflate";

/**
 * Just enough of an .xlsx reader for exports: every sheet as rows of cell
 * text. No formulas, styles or dates — an export's cells are values, and OVR
 * writes even its numbers as text. Runs in the browser (DOMParser), so the
 * file is read before anything is uploaded.
 */

export interface SheetRows {
  name: string;
  /** Row by row; missing cells are "". */
  rows: string[][];
}

export class WorkbookError extends Error {}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
/** Larger than any export; refuses a zip that expands to absurd sizes. */
const MAX_PART_BYTES = 50 * 1024 * 1024;

function parse(files: Record<string, Uint8Array>, path: string): Document | null {
  const data = files[path];
  if (!data) return null;
  const document = new DOMParser().parseFromString(strFromU8(data), "application/xml");
  return document.getElementsByTagName("parsererror").length ? null : document;
}

/** A string item's text, rich-text runs joined, phonetic hints left out. */
function itemText(item: Element): string {
  let text = "";
  for (const node of Array.from(item.getElementsByTagNameNS(MAIN, "t"))) {
    if (node.parentElement?.localName === "rPh") continue;
    text += node.textContent ?? "";
  }
  return text;
}

/** "AB12" → 27 (zero-based column). */
export function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/i.exec(reference)?.[0].toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function partPath(target: string): string {
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return path.replace(/\/\.\//g, "/");
}

export function readWorkbook(data: Uint8Array): SheetRows[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (file) => file.originalSize <= MAX_PART_BYTES && (file.name.endsWith(".xml") || file.name.endsWith(".rels")) });
  } catch {
    throw new WorkbookError("This isn’t an Excel file (.xlsx).");
  }
  const workbook = parse(files, "xl/workbook.xml");
  if (!workbook) throw new WorkbookError("This isn’t an Excel file (.xlsx).");

  const targets = new Map<string, string>();
  const relationships = parse(files, "xl/_rels/workbook.xml.rels");
  for (const relationship of Array.from(relationships?.getElementsByTagName("Relationship") ?? [])) {
    targets.set(relationship.getAttribute("Id") ?? "", relationship.getAttribute("Target") ?? "");
  }

  const shared = Array.from(parse(files, "xl/sharedStrings.xml")?.getElementsByTagNameNS(MAIN, "si") ?? []).map(itemText);

  return Array.from(workbook.getElementsByTagNameNS(MAIN, "sheet")).flatMap((sheet) => {
    const target = targets.get(sheet.getAttributeNS(RELATIONSHIPS, "id") ?? "");
    const document = target ? parse(files, partPath(target)) : null;
    if (!document) return [];
    const rows: string[][] = [];
    for (const row of Array.from(document.getElementsByTagNameNS(MAIN, "row"))) {
      const cells: string[] = [];
      let next = 0;
      for (const cell of Array.from(row.getElementsByTagNameNS(MAIN, "c"))) {
        const reference = cell.getAttribute("r");
        const index = reference ? columnIndex(reference) : next;
        next = index + 1;
        const type = cell.getAttribute("t");
        const raw = cell.getElementsByTagNameNS(MAIN, "v")[0]?.textContent ?? "";
        const inline = cell.getElementsByTagNameNS(MAIN, "is")[0];
        const value = type === "s" ? shared[Number(raw)] ?? ""
          : type === "inlineStr" ? (inline ? itemText(inline) : "")
          : type === "b" ? (raw === "1" ? "TRUE" : "FALSE")
          : raw;
        while (cells.length < index) cells.push("");
        cells[index] = value;
      }
      const at = Number(row.getAttribute("r"));
      // Keep row positions honest when blank rows are left out of the file.
      if (Number.isInteger(at) && at > rows.length + 1) while (rows.length < at - 1) rows.push([]);
      rows.push(cells);
    }
    return [{ name: sheet.getAttribute("name") ?? "", rows }];
  });
}
