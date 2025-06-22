// TODO

import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Internal extraction structures -------------------------------------------
export interface ExperiencePosition {
  title: string;
  company: string;
  location: string;
  start: string; // e.g. "Jan 2020"
  end: string | null; // null when "Present"
  summary: string; // currently empty; reserved for future
}

export interface RawEducationEntry {
  school: string;
  degree: string;
  field?: string;
  start?: string | null;
  end?: string | null;
}

// JSON Resume v1 minimal types ---------------------------------------------

export interface JSONResumeWork {
  name: string; // Company / organization name
  position: string; // Job title
  location?: string;
  startDate?: string | null; // YYYY or YYYY-MM
  endDate?: string | null;   // same format, null = present
  summary?: string;
}

export interface JSONResumeEducation {
  institution: string;
  studyType?: string; // Degree
  area?: string;      // Field of study
  startDate?: string | null;
  endDate?: string | null;
}

export interface JSONResumeLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  region?: string;
}

export interface JSONResumeBasics {
  name?: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  location?: JSONResumeLocation;
  summary?: string;
}

export interface JSONResume {
  $schema?: string;
  basics?: JSONResumeBasics;
  work: JSONResumeWork[];
  education: JSONResumeEducation[];
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
): Promise<JSONResume> {
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

  // --- Basics extraction (top of PDF) --------------------------------------
  interface ProfileObj { network:string; username?:string; url:string; }
  const basics: JSONResumeBasics & { profiles?: ProfileObj[] } = {} as any;
  const profiles: ProfileObj[] = [];
  {
    // take first 60 lines of first page regardless of minor headers; this avoids "Contact" at very top being mistaken for break.
    const topLines = lines.slice(0, 60);

    if (topLines.length) {
      // Name (largest font)
      const nameLine = topLines.reduce((prev, curr) => {
        if (curr.fontSize > prev.fontSize && curr.text.length > 3) return curr;
        return prev;
      }, topLines[0]);
      // Split credentials after comma (e.g., ", PhD")
      const nameRaw = nameLine.text;
      if (/,/.test(nameRaw)) {
        const [primary, ...rest] = nameRaw.split(',');
        basics.name = primary.trim();
        // credential part ignored for now
      } else {
        basics.name = nameRaw;
      }
      const nameIdx = topLines.indexOf(nameLine);

      // Headline / label
      const labelParts: string[] = [];
      for (let i = nameIdx + 1; i < topLines.length; i++) {
        const txt = topLines[i].text;
        if (/^(Contact|Summary|Top Skills)$/i.test(txt)) break;
        if (headerRe.test(txt)) break;
        if (/@/.test(txt) || /linkedin\.|http|www\./i.test(txt)) continue; // skip contact/urls
        if (txt.length < 3) continue;
        labelParts.push(txt);
        if (labelParts.length >= 2) break;
      }
      if (labelParts.length) {
        let lbl = labelParts.join(' ').trim();
        lbl = lbl.replace(/\s*\(LinkedIn\)$/i,'').trim();
        if (/\|/.test(lbl)) {
          basics.summary = lbl;
        } else {
          basics.label = lbl;
        }
      }

      const blob = topLines.map((l) => l.text).join(' ');

      // Email may be broken across line (e.g., split at char). Try collapsed blob too.
      const emailRegex = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
      const collapsed = blob.replace(/\s+/g, '');
      const emailCandidates = [
        ...blob.match(emailRegex) ?? [],
        ...collapsed.match(emailRegex) ?? []
      ];
      const filtered = emailCandidates.filter(e => /\.[A-Za-z]{3,}$/.test(e));
      filtered.sort((a,b)=>a.length-b.length);
      const preferred = filtered[0] || emailCandidates[0];
      basics.email = preferred;

      const urlMatch = blob.match(/https?:\/\/\S*linkedin\.com\/[^\s)]+/i) || blob.match(/www\.linkedin\.com\/[^\s)]+/i);
      if (urlMatch) {
        let url = urlMatch[0].replace(/\)+$/,'');
        if (!/^https?:/i.test(url)) {
          url = 'https://' + url;
        }
        const userMatch = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (userMatch) {
          profiles.push({ network: 'LinkedIn', username: userMatch[1], url });
        }
      }

      const phoneMatch = blob.match(/\+?\d[\d\s\-\(\)]{7,}\d/);
      if (phoneMatch) basics.phone = phoneMatch[0];

      // Find location: first comma line after name & label and not containing 'LinkedIn'
      let locLine: {text:string}|undefined;
      const idxAfterName = nameIdx + 1;
      const headerAfterIdxRel = topLines.slice(idxAfterName).findIndex((l)=> headerRe.test(l.text) && !/^Contact$/i.test(l.text));
      const scanMax = headerAfterIdxRel === -1 ? topLines.length : idxAfterName + headerAfterIdxRel;
      for (let i = nameIdx+1; i < scanMax; i++) {
        const t = topLines[i].text;
        if ((basics.label && t===basics.label) || (basics.summary && t===basics.summary)) continue;
        if (/@|http|www\.|linkedin/i.test(t)) continue;
        if (/\|/.test(t)) continue;
        if (!/,/.test(t)) continue;
        if (/LinkedIn/i.test(t)) continue;
        if (/\d/.test(t)) continue; // avoid job title lines containing numbers
        locLine = topLines[i];
        break;
      }
      if (!locLine) {
        locLine = topLines.slice(nameIdx+1, scanMax).find((l)=>/,/.test(l.text) && /(United|Area|[A-Z]{2})/i.test(l.text));
      }
      if (!locLine) {
        for (let i = nameIdx+1; i < scanMax; i++) {
          const t = topLines[i].text;
          if ((basics.label && t===basics.label) || (basics.summary && t===basics.summary)) continue;
          if (/LinkedIn|www\.|http/i.test(t)) continue;
          if (/\|/.test(t)) continue;
          if (/Area$/i.test(t) || /(California|CA|United States)/i.test(t)) {
            locLine = topLines[i];
            break;
          }
        }
      }
      if (locLine) {
        const parts = locLine.text.split(/,\s*/);
        const city = parts.shift()!;
        let countryCode: string | undefined;
        let region: string | undefined;
        if (parts.length) {
          const last = parts[parts.length - 1];
          if (/United/i.test(last) || last.length === 2) {
            countryCode = last;
            parts.pop();
          }
          region = parts.join(', ').trim() || undefined;
        }
        const locObj: JSONResumeLocation & { countryCode?: string } = { city } as any;
        if (region) locObj.region = region;
        if (countryCode) locObj.countryCode = countryCode;
        basics.location = locObj;
      }
      if (profiles.length) (basics as any).profiles = profiles;

      // Fallback: check lines individually in case email split onto next line
      for (let i = 0; i < topLines.length; i++) {
        if (/@/.test(topLines[i].text)) {
          const combo = (topLines[i].text + (topLines[i + 1]?.text ?? '')).replace(/\s+/g, '');
          const m = combo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
          if (m) {
            if (!basics.email || m[0].length < basics.email.length) {
              basics.email = m[0];
            }
            break;
          }
        }
      }
    }

    // Remove undefined props so object comparison ignores missing fields
    Object.keys(basics).forEach((k)=>{
      if ((basics as any)[k] === undefined) {
        delete (basics as any)[k];
      }
    });
  }

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
  const education: RawEducationEntry[] = [];
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

  const monthMap: Record<string, string> = {
    january: "01", jan: "01",
    february: "02", feb: "02",
    march: "03", mar: "03",
    april: "04", apr: "04",
    may: "05",
    june: "06", jun: "06",
    july: "07", jul: "07",
    august: "08", aug: "08",
    september: "09", sep: "09",
    october: "10", oct: "10",
    november: "11", nov: "11",
    december: "12", dec: "12",
  };

  const toIso = (val: string | null | undefined): string | null | undefined => {
    if (!val) return val ?? null;
    const parts = val.split(/\s+/);
    if (parts.length === 2) {
      const m = monthMap[parts[0].toLowerCase()];
      const y = parts[1];
      if (m && /\d{4}/.test(y)) return `${y}-${m}`;
    }
    return val; // fallback
  };

  return {
    $schema: "https://jsonresume.org/schema/1.0.0/resume.json",
    basics,
    work: positions.map((p) => ({
      name: p.company,
      position: p.title,
      location: p.location || undefined,
      startDate: toIso(p.start) ?? undefined,
      endDate: toIso(p.end) ?? null,
      summary: p.summary || undefined,
    })),
    education: education.map((e) => ({
      institution: e.school,
      studyType: e.degree || undefined,
      area: e.field || undefined,
      startDate: e.start ?? undefined,
      endDate: e.end ?? undefined,
    })),
  };
}
