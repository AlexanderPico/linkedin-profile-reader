// TODO

import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/** Position within the Experience section. */
export interface ExperiencePosition {
  title: string;
  company: string;
  location: string;
  start: string; // e.g. "Jan 2020"
  end: string | null; // null when \"Present\"
  summary: string; // currently empty; reserved for future
}

export interface EducationEntry {
  school: string;
  degree: string;
  field?: string;
  start?: string;
  end?: string | null;
}

/** Parsed profile data (currently only Experience). */
export interface LinkedInProfile {
  positions: ExperiencePosition[];
  education: EducationEntry[];
}

/**
 * Parse a LinkedIn-exported profile PDF and return structured data.
 *
 * Only the Experience section is extracted for now.
 *
 * @param input  Absolute path to the PDF or the file Buffer.
 */
export async function parseLinkedInPdf(
  input: string | Buffer
): Promise<LinkedInProfile> {
  // --- Load PDF -------------------------------------------------------------
  let data: Uint8Array | string;
  if (typeof input === "string") {
    const path = input;
    if (!fs.existsSync(path)) {
      throw new Error(`PDF not found at ${path}`);
    }
    data = new Uint8Array(fs.readFileSync(path));
  } else {
    data = new Uint8Array(input);
  }

  const doc = await pdfjs.getDocument({ data }).promise;

  // --- Helper utilities -----------------------------------------------------
  const round = (n: number, prec = 2): number => {
    const f = Math.pow(10, prec);
    return Math.round(n * f) / f;
  };

  const clean = (text: string): string => text.replace(/\s+/g, " ").trim();

  // --- Gather all text items with position & fontSize -----------------------
  type Line = { text: string; fontSize: number };
  const lines: Line[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent({ disableCombineTextItems: false } as any);
    // Group words by Y to form lines
    const byY = new Map<number, { x: number; text: string; fontSize: number }[]>();

    content.items.forEach((it: any) => {
      const y = round(it.transform[5], 1); // group by y position (rounded)
      const x = it.transform[4];
      const text = clean(it.str);
      if (!text) return;
      const fontSize = Math.hypot(it.transform[0], it.transform[1]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x, text, fontSize });
    });

    // sort lines by y desc (top to bottom)
    const sortedYs = Array.from(byY.keys()).sort((a, b) => b - a);
    sortedYs.forEach((y) => {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = items.map((i) => i.text).join(" ").trim();
      const maxFont = Math.max(...items.map((i) => i.fontSize));
      lines.push({ text: lineText, fontSize: maxFont });
    });
  }

  // --- Heuristic helpers ----------------------------------------------------
  const dateRe = /[A-Za-z]{3,9}\s+\d{4}\s*[–-]\s*(Present|[A-Za-z]{3,9}\s+\d{4})/;
  const durationRe = /\d+\s+(?:yr|yrs|year|years|mos?|months?)/i;
  const headerRe = /^(Experience|Education|Certifications?|Publications?|Skills|Summary|Contact|Top Skills|Projects)/i;

  const isNoise = (line: string): boolean => {
    return line === "" || /^Page \d+/i.test(line);
  };
  const isLocation = (line: string): boolean => {
    if (!line) return false;
    if (durationRe.test(line) || dateRe.test(line)) return false;
    if (/,/.test(line)) return true;
    if (/\bCampus\b/i.test(line)) return true;
    if (/\b[A-Z][a-z]+,?\s+[A-Z]{2}\b/.test(line)) return true; // city state
    if (/\b[A-Z]{2}\b$/.test(line)) return true; // state code at end
    if (/\bArea$/i.test(line)) return true;
    return false;
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const looksLikeCompany = (line: string): boolean => {
    if (!line) return false;
    if (dateRe.test(line) || durationRe.test(line) || isLocation(line)) return false;
    if (/Director|Engineer|Scientist|Manager|Fellow|Vice|President/i.test(line)) return false;
    return true;
  };

  // --- Main extraction loop -------------------------------------------------
  let currentCompany = "";
  const positions: ExperiencePosition[] = [];
  const education: EducationEntry[] = [];
  const seen = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const txt = lines[idx].text;

    if (!dateRe.test(txt)) continue;

    const m = txt.match(/([A-Za-z]+ \d{4})\s*[–-]\s*(Present|[A-Za-z]+ \d{4})/);
    const start = m ? m[1] : "";
    const endVal = m ? m[2] : "";
    const end = /Present/i.test(endVal) ? null : endVal;

    const dateFont = lines[idx].fontSize;

    // Identify title lines above the date line with equal font size
    let tIdx = idx - 1;
    while (
      tIdx >= 0 &&
      (isNoise(lines[tIdx].text) || lines[tIdx].fontSize <= dateFont + 0.1)
    ) {
      tIdx--;
    }
    if (tIdx < 0) continue;

    const firstLine = lines[tIdx];
    const titleParts: string[] = [firstLine.text];
    const titleFont = firstLine.fontSize;
    tIdx--;
    // collect additional lines immediately above with same font size (within 0.2pt)
    while (tIdx >= 0) {
      const lineObj = lines[tIdx];
      const ltxt = lineObj.text;
      const fSize = lineObj.fontSize;

      if (isNoise(ltxt) || dateRe.test(ltxt) || durationRe.test(ltxt)) break; // allow commas in titles
      if (Math.abs(fSize - titleFont) > 0.2) break; // different font -> stop

      titleParts.unshift(ltxt);
      tIdx--;
    }
    const title = titleParts.join(" ").trim();
    if (!title) continue;

    // find company: search further up for first line with larger/equal font size than titleFont
    let cIdx = tIdx;
    let companyFound = currentCompany; // fallback to last known
    while (cIdx >= 0) {
      const l = lines[cIdx];
      if (!isNoise(l.text) && !headerRe.test(l.text) && !dateRe.test(l.text) && !durationRe.test(l.text)) {
        if (l.fontSize > titleFont + 0.1) {
          companyFound = l.text;
          break;
        }
      }
      cIdx--;
    }
    currentCompany = companyFound;

    // location line just after date
    let location = "";
    for (let j = idx + 1; j <= idx + 5 && j < lines.length; j++) {
      const lObj = lines[j];
      const ltxt = lObj.text;
      if (dateRe.test(ltxt)) break; // next block starts
      if (headerRe.test(ltxt)) continue; // skip section headers
      if (lObj.fontSize > dateFont + 0.1) break; // assume new title block
      if (isLocation(ltxt)) {
        location = ltxt;
        break;
      }
    }

    const key = title + start + currentCompany;
    if (seen.has(key)) continue;
    seen.add(key);

    positions.push({ title, company: currentCompany, location, start, end, summary: "" });
  }

  // ------------------- EDUCATION PARSING -----------------------------------
  const eduHeaderIdx = lines.findIndex((l) => /^Education\b/i.test(l.text));
  if (eduHeaderIdx !== -1) {
    let idx = eduHeaderIdx + 1;
    while (idx < lines.length) {
      // skip blank / noise lines
      if (isNoise(lines[idx].text)) { idx++; continue; }

      // break if we reach another major section
      if (headerRe.test(lines[idx].text) && !/^Education\b/i.test(lines[idx].text)) {
        break;
      }

      const school = lines[idx].text.trim();
      idx++;

      // move to degree line
      while (idx < lines.length && isNoise(lines[idx].text)) idx++;
      if (idx >= lines.length) break;

      let degreeFieldStr = lines[idx].text.trim();

      // accumulate additional lines that belong to the same degree/field
      const schoolFont = lines[idx - 1].fontSize; // font of school line
      let look = idx + 1;
      while (look < lines.length) {
        const t = lines[look].text.trim();
        if (isNoise(t)) { look++; continue; }
        if (headerRe.test(t)) break;
        if (lines[look].fontSize >= schoolFont - 0.01) break; // new school starts
        // stop at date-only or year-range line (starts new block)
        if (/^[\u2022•·]?\s*\(?[0-9]{4}(?:\s*[–-]\s*(Present|[0-9]{4}))?\)?$/.test(t)) break;
        degreeFieldStr += ' ' + t;
        look++;
      }
      idx = look - 1; // last consumed line for this entry

      // parse date range in degreeRaw or will fallback to separate line
      let start: string | undefined;
      let end: string | null | undefined;
      const dateMatch = degreeFieldStr.match(/(?:[\u2022•·]\s*)?\(?([0-9]{4})(?:\s*[–-]\s*(Present|[0-9]{4}))?\)?$/);
      if (dateMatch) {
        start = dateMatch[1];
        const endVal = dateMatch[2];
        end = endVal ? (/Present/i.test(endVal) ? null : endVal) : null;
        degreeFieldStr = degreeFieldStr.slice(0, degreeFieldStr.indexOf(dateMatch[0])).trim();
      }

      // remove trailing bullets / separators
      degreeFieldStr = degreeFieldStr.replace(/[\u2022•·]+$/,'').trim().replace(/,+$/,'');

      const degreeSet = new Set(['PHD','MSC','MS','MBA','MD','BS','BA','BSC','BACHELOR','MASTER','DOCTOR']);
      let degree = '';
      let field: string | undefined;
      if (degreeFieldStr.includes(',')) {
        const [lhs, rhs] = degreeFieldStr.split(/,(.+)/);
        const lhsTrim = lhs.trim();
        const rhsTrim = (rhs ?? '').trim();
        const lhsKey = lhsTrim.split(/\s+/)[0].replace(/\./g,'').toUpperCase();

        if (degreeSet.has(lhsKey)) {
          degree = lhsTrim;
          field = rhsTrim || undefined;
        } else if (/Tech/i.test(lhsTrim)) {
          degree = lhsTrim.trim();
          field = rhsTrim || undefined;
        } else {
          field = degreeFieldStr.trim();
        }
      } else if (/\bin\b/i.test(degreeFieldStr)) {
        const [deg, fld] = degreeFieldStr.split(/\bin\b/i);
        degree = deg.trim();
        field = fld.trim();
      } else {
        // If begins with known degree keyword treat as degree, else it's field only
        const firstTokRaw = degreeFieldStr.split(/\s+/)[0];
        const firstTok = firstTokRaw.replace(/\./g,'').toUpperCase();
        if (degreeSet.has(firstTok)) {
          degree = firstTokRaw.replace(/\./g,'');
          field = degreeFieldStr.slice(firstTokRaw.length).trim().replace(/^,\s*/,'');
        } else {
          field = degreeFieldStr;
        }
      }

      if (!start) {
        let probe = idx + 1;
        while (probe < lines.length && isNoise(lines[probe].text)) probe++;
        if (probe < lines.length) {
          const m = lines[probe].text.trim().match(/^[\u2022•·]?\s*\(?([0-9]{4})\)?$/);
          if (m) {
            start = m[1];
            end = null;
            idx = probe; // consume date-only line
          }
        }
      }

      // normalize degree abbreviation dots (e.g., B.S. -> BS) and casing
      // keep dots in degree to preserve original formatting

      if (field) field = field.replace(/,+$/,'').trim();

      if (start === undefined) start = null as any;
      if (end === undefined) end = null;

      education.push({ school, degree, field, start, end });

      idx++;
    }
  }

  // -------------------------------------------------------------------------

  return { positions, education };
}
