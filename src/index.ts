/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO

import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Internal extraction structures -------------------------------------------
export interface ExperiencePosition {
  title: string;
  company: string;
  location?: string;
  start: string; // e.g. "Jan 2020"
  end: string | null;
  summary?: string;
  url?: string;
  highlights?: string[];
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
  url?: string;
  highlights?: string[];
}

export interface JSONResumeEducation {
  institution: string;
  studyType?: string; // Degree
  area?: string;      // Field of study
  startDate?: string | null;
  endDate?: string | null;
}

export interface JSONResumeSkill {
  name: string;
  level?: string;
  keywords?: string[];
}

export interface JSONResumeCertificate {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

export interface JSONResumeLanguage {
  language: string;
  fluency?: string;
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
  skills?: JSONResumeSkill[];
  certificates?: JSONResumeCertificate[];
  languages?: JSONResumeLanguage[];
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
  type Line = { text: string; fontSize: number; y: number; page: number; minX: number; maxX: number; column: 'left' | 'right' };
  const lines: Line[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent({ disableCombineTextItems: false } as any);
    // Group words by Y to form lines
    const byY = new Map<number, { x: number; text: string; fontSize: number }[]>();

    content.items.forEach((it: any) => {
      const yPos = round(it.transform[5], 1); // group by y position (rounded)
      const x = it.transform[4];
      const text = clean(it.str);
      if (!text) return;
      const fontSize = Math.hypot(it.transform[0], it.transform[1]);
      if (!byY.has(yPos)) byY.set(yPos, []);
      byY.get(yPos)!.push({ x, text, fontSize });
    });

    // sort lines by y desc (top to bottom)
    const sortedYs = Array.from(byY.keys()).sort((a, b) => b - a);
    sortedYs.forEach((yKey) => {
      const items = byY.get(yKey)!.sort((a, b) => a.x - b.x);
      const lineText = items.map((i) => i.text).join(" ").trim();
      const maxFont = Math.max(...items.map((i) => i.fontSize));
      const minX = Math.min(...items.map((i) => i.x));
      const maxX = Math.max(...items.map((i) => i.x));
      lines.push({ text: lineText, fontSize: maxFont, y: yKey, page: p, minX, maxX, column: 'left' }); // column will be determined later
    });
  }

  // After collecting all lines, compute baseline line spacing
  const yDiffs: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i - 1].y - lines[i].y;
    if (d > 0 && d < 40) yDiffs.push(d);
  }
  yDiffs.sort((a, b) => a - b);
  const baselineGap = yDiffs.length ? yDiffs[Math.floor(yDiffs.length / 2)] : 12; // fallback 12pt

  // --- Column Detection ---------------------------------------------------
  // Detect two-column layout by analyzing X coordinates
  const topLines = lines.slice(0, 50); // analyze first 50 lines
  const xPositions = topLines.flatMap(line => [line.minX, line.maxX]);
  xPositions.sort((a, b) => a - b);
  const minX = Math.min(...xPositions);
  const maxX = Math.max(...xPositions);
  const columnBoundary = (minX + maxX) / 2;
  
  // Assign column based on X position
  lines.forEach(line => {
    line.column = line.minX < columnBoundary ? 'left' : 'right';
  });

  // Filter lines by column for content extraction
  const rightColumnLines = lines.filter(line => line.column === 'right');
  const leftColumnLines = lines.filter(line => line.column === 'left');

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
        const [primary] = nameRaw.split(',');
        basics.name = primary.trim();
        // credential part ignored for now
      } else {
        basics.name = nameRaw;
      }
      const nameIdx = topLines.indexOf(nameLine);



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
        if ((basics.summary && t===basics.summary)) continue;
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
          if ((basics.summary && t===basics.summary)) continue;
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

      // Look for label/headline content (before Summary section)
      const labelParts: string[] = [];
      for (let i = nameIdx + 1; i < topLines.length; i++) {
        const txt = topLines[i].text;
        if (/^(Contact|Summary|Top Skills)$/i.test(txt)) break;
        if (headerRe.test(txt)) break;
        if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(txt) || /linkedin\.|http|www\./i.test(txt)) continue; // skip actual emails/urls
        // Check if line is location-like (but can't use isLocation function yet as it's defined later)
        const looksLikeLocation = /,/.test(txt) && /(United|States|California|Area|City|Town|Province|Region|District|[A-Z]{2}$)/i.test(txt);
        if (looksLikeLocation) continue; // skip location lines
        if (txt.length < 3) continue;
        labelParts.push(txt);
        if (labelParts.length >= 2) break;
      }
      if (labelParts.length) {
        let lbl = labelParts.join(' ').trim();
        lbl = lbl.replace(/\s*\(LinkedIn\)$/i,'').trim();
        basics.label = lbl;
      }

      // Look for Summary section content (detailed summary) - only in right column
      const rightTopLines = topLines.filter(l => l.column === 'right');
      const summaryHeaderIdx = rightTopLines.findIndex(l => /^Summary$/i.test(l.text));
      if (summaryHeaderIdx !== -1) {
        const summaryParts: string[] = [];
        for (let i = summaryHeaderIdx + 1; i < rightTopLines.length; i++) {
          const txt = rightTopLines[i].text;
          if (/^Experience$/i.test(txt)) break; // stop at Experience header
          if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(txt) || /linkedin\.|http|www\./i.test(txt)) continue; // skip emails/urls
          // Skip very short lines unless they look like continuation words
          if (txt.length < 8 && !/[.!?]$/.test(txt)) continue; // allow short lines ending with punctuation
          if (rightTopLines[i].fontSize < 11.5) continue; // skip smaller font (likely skills)
          summaryParts.push(txt);
        }
        if (summaryParts.length) {
          basics.summary = summaryParts.join(' ').trim();
        }
      }

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
    return line === "" || /^\s*[\u2022•\-*]?\s*Page \d+/i.test(line);
  };
  const isLocation = (line: string): boolean => {
    if (!line) return false;
    if (line.length > 60) return false; // too long to be a location
    if (durationRe.test(line) || dateRe.test(line)) return false;
    const wordCount = line.trim().split(/\s+/).length;
    if (wordCount > 8) return false; // locations are usually short
    
    // Exclude job titles and roles
    if (/\b(Engineer|Scientist|Manager|Director|Lead|Leader|Analyst|Developer|Coordinator|Specialist|Associate|Assistant|Officer|Consultant|Advisor|Executive|Vice|President|CEO|CTO|CFO|VP)\b/i.test(line)) return false;
    
    const locationKeywords = /(Area|County|Bay|City|Town|United|Kingdom|States?|Province|Region|District|California|New York|Texas|Washington|Florida|Massachusetts|Virginia|Colorado|Arizona|Oregon|Ohio|Georgia|Illinois|Pennsylvania|Michigan|Wisconsin|North Carolina|South Carolina|[A-Z]{2}$)/i;
    
    // Major cities that should be recognized as locations
    const majorCities = /^(Bangalore|Mumbai|Delhi|Chennai|Hyderabad|Pune|Kolkata|Ahmedabad|Surat|Jaipur|Lucknow|Kanpur|Nagpur|Indore|Thane|Bhopal|Visakhapatnam|Pimpri|Patna|Vadodara|Ghaziabad|Ludhiana|Agra|Nashik|Faridabad|Meerut|Rajkot|Kalyan|Vasai|Varanasi|Srinagar|Aurangabad|Dhanbad|Amritsar|Navi Mumbai|Allahabad|Ranchi|Howrah|Coimbatore|Jabalpur|Gwalior|Vijayawada|Jodhpur|Madurai|Raipur|Kota|Guwahati|Chandigarh|Solapur|Hubli|Tiruchirappalli|Bareilly|Mysore|Tiruppur|Gurgaon|Aligarh|Jalandhar|Bhubaneswar|Salem|Warangal|Guntur|Bhiwandi|Saharanpur|Gorakhpur|Bikaner|Amravati|Noida|Jamshedpur|Bhilai|Cuttack|Firozabad|Kochi|Nellore|Bhavnagar|Dehradun|Durgapur|Asansol|Rourkela|Nanded|Kolhapur|Ajmer|Akola|Gulbarga|Jamnagar|Ujjain|Loni|Siliguri|Jhansi|Ulhasnagar|Jammu|Sangli|Mangalore|Erode|Belgaum|Ambattur|Tirunelveli|Malegaon|Gaya|Jalgaon|Udaipur|Maheshtala)$/i;
    
    if (/,/.test(line) && locationKeywords.test(line)) return true;
    if (/\bCampus\b/i.test(line)) return true;
    if (/\b[A-Z][a-z]+,?\s+[A-Z]{2}\b/.test(line)) return true; // city state
    if (/\b[A-Z]{2}\b$/.test(line)) return true; // state code at end
    if (/\bArea$/i.test(line)) return true;
    if (majorCities.test(line.trim())) return true; // major city names
    return false;
  };




  // Precompute section header indices for scoped parsing - use right column only
  const experienceHeaderIdx = rightColumnLines.findIndex((l) => /^Experience\b/i.test(l.text));
  const educationHeaderIdx = rightColumnLines.findIndex((l) => /^Education\b/i.test(l.text));

  // --- Main extraction loop -------------------------------------------------
  let currentCompany = "";
  const positions: ExperiencePosition[] = [];
  const education: RawEducationEntry[] = [];
  const seen = new Set<string>();

  for (let idx = 0; idx < rightColumnLines.length; idx++) {
    // Only consider lines within the Experience section boundaries
    if (experienceHeaderIdx !== -1 && idx <= experienceHeaderIdx) continue; // not yet inside Experience
    if (educationHeaderIdx !== -1 && idx >= educationHeaderIdx) break;      // reached Education (or later)

    const txt = rightColumnLines[idx].text;

    if (!dateRe.test(txt)) continue;

    const m = txt.match(/([A-Za-z]+ \d{4})\s*[–-]\s*(Present|[A-Za-z]+ \d{4})/);
    const start = m ? m[1] : "";
    const endVal = m ? m[2] : "";
    const end = /Present/i.test(endVal) ? null : endVal;

    const dateFont = rightColumnLines[idx].fontSize;

    // Identify title lines above the date line with equal font size
    let tIdx = idx - 1;
    while (
      tIdx >= 0 &&
      (isNoise(rightColumnLines[tIdx].text) || rightColumnLines[tIdx].fontSize <= dateFont + 0.1)
    ) {
      tIdx--;
    }
    if (tIdx < 0) continue;

    const firstLine = rightColumnLines[tIdx];
    const titleParts: string[] = [firstLine.text];
    const titleFont = firstLine.fontSize;
    tIdx--;
    // collect additional lines immediately above with same font size (within 0.2pt)
    while (tIdx >= 0) {
      const lineObj = rightColumnLines[tIdx];
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
      const l = rightColumnLines[cIdx];
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
    let urlFound: string | undefined;
    interface HL { text: string; bullet: boolean; gap: boolean; y: number; page: number; }
    const highlightSegs: HL[] = [];
    let gapSinceLast = false;
    // Scan until next date line or education section (no arbitrary limit)
    for (let j = idx + 1; j < rightColumnLines.length; j++) {
      // Stop if we reach the Education section
      if (educationHeaderIdx !== -1 && j >= educationHeaderIdx) break;
      const lObj = rightColumnLines[j];
      const ltxt = lObj.text;
      

      
      if (ltxt === '') { gapSinceLast = true; continue; }
      if (/^Page \d+/i.test(ltxt)) { 
        if (ltxt.includes('Critical care')) console.log(`DEBUG: Critical care line skipped as page number`);
        gapSinceLast = false; continue; 
      }
      
      // Check for location BEFORE other break conditions (locations are often in gray/smaller font)
      if (!location && isLocation(ltxt) && lObj.fontSize >= dateFont - 0.5) { // Slightly more lenient for gray locations
        location = ltxt;
      }
      
      if (dateRe.test(ltxt)) break; // next block starts
      if (headerRe.test(ltxt)) continue; // skip section headers
      if (lObj.fontSize > dateFont + 0.1) break; // assume new title block
      if (!urlFound && ( /https?:\/\//i.test(ltxt) || /[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/[^\s)]+/.test(ltxt) ) ) {
        urlFound = ltxt.startsWith('http') ? ltxt : 'https://' + ltxt.replace(/^www\./i, '');
        continue;
      }
      const wordCnt = ltxt.trim().split(/\s+/).length;
      const bulletLine = /^\s*(?:[\u2022•·\-*]|\d+[.)]|[a-zA-Z][.)])/u.test(ltxt);
      const prevSeg = highlightSegs.length ? highlightSegs[highlightSegs.length-1] : undefined;
      const prevY2 = highlightSegs.length ? highlightSegs[highlightSegs.length-1].y : undefined;
      const largeGapCurrent = prevY2 !== undefined && (prevY2 - lObj.y) > baselineGap * 1.6;
      const pageChange = prevSeg && prevSeg.page !== (rightColumnLines[j].page ?? 0);
      const gapFlag = gapSinceLast || largeGapCurrent || (!!pageChange);
      const continuation = prevSeg && !prevSeg.bullet && !prevSeg.gap && !gapFlag && prevSeg.page === rightColumnLines[j].page;
      let textClean = ltxt.replace(/^\s*(?:[\u2022•·\-*]|\d+[.)]|[a-zA-Z][.)](?=\s))\s*/, '').trim();
      if (/^(Work involved|Responsibilities)[:\-]/i.test(textClean)) {
        textClean = textClean.replace(/^(Work involved|Responsibilities)[:\-]\s*/i, '');
      }
      
      // Skip URL-like content that's just domain names
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(textClean) && !/\s/.test(textClean)) {
        continue;
      }
      
      // Skip only clearly problematic content (keeping minimal filtering since we now have column separation)
      if (/WikiPathways|PathVisio/i.test(textClean) || // Alex's specific publication titles
          (textClean.endsWith(':') && textClean.split(' ').length < 8)) { // Incomplete phrases ending with colon
        continue;
      }
      // defer push until after conditions below
      let isLocationLine = location === ltxt; // Check if this line was just set as location
      
      if (!isLocationLine && textClean && (bulletLine || gapFlag || continuation || lObj.fontSize < dateFont - 0.2 || wordCnt > 8 || (!bulletLine && !gapFlag && wordCnt >= 1))) {
        // add highlight segment now
        highlightSegs.push({ text: textClean, bullet: bulletLine, gap: gapFlag, y: lObj.y, page: rightColumnLines[j].page });
        if(pageChange) gapSinceLast = false;
      }
    }

    if (!urlFound) {
      const slug = currentCompany.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      if (slug.length > 4) {
        const urlRegex = new RegExp(`(?:https?:\/\/)?[A-Za-z0-9.-]*${slug}[A-Za-z0-9.-]*\.[A-Za-z]{2,}(?:\/[^\s)]+)?`, 'i');
        const mLine = rightColumnLines.find(l => urlRegex.test(l.text));
        if (mLine) {
          const matches = mLine.text.match(urlRegex);
          if (matches && matches.length) {
            matches.sort((a,b)=>b.length-a.length);
            const pick = matches[0];
            urlFound = pick.startsWith('http')? pick : 'https://'+pick;
          }
        }
      }
    }

    if (!urlFound) {
      const caps = currentCompany.match(/[A-Z]/g);
      const acronym = caps ? caps.join('').toLowerCase() : currentCompany.split(/\s+/).map(w=>w[0]).join('').toLowerCase();
      if (acronym.length>=3) {
        const urlRegex = new RegExp(`(?:https?:\\/\\/)?[A-Za-z0-9.-]*${acronym}[A-Za-z0-9.-]*\\.[A-Za-z]{2,}(?:\\/[^\s)]+)?`, 'i');
        const mLine = rightColumnLines.find(l => urlRegex.test(l.text));
        if (mLine) {
          const matches = mLine.text.match(urlRegex);
          if (matches && matches.length) {
            matches.sort((a,b)=>b.length-a.length);
            const pick = matches[0];
            urlFound = pick.startsWith('http')? pick : 'https://'+pick;
          }
        }
      }
    }

    const key = title + start + currentCompany;
    if (seen.has(key)) continue;
    seen.add(key);

    const pos: ExperiencePosition = { title, company: currentCompany, start, end } as any;
    if (location) pos.location = location;
    if (urlFound) pos.url = urlFound;
    if (highlightSegs.length) {
      const merged: string[] = [];
      highlightSegs.forEach((seg) => {
        if (merged.length === 0 || seg.bullet || seg.gap) {
          merged.push(seg.text);
          return;
        }
        const prevText = merged[merged.length - 1].trim();
        const startsLower = /^[a-z]/.test(seg.text);
        const endPunct = /[.!?]$/;
        const words = seg.text.split(/\s+/).length;
        if (startsLower) {
          merged[merged.length - 1] += ' ' + seg.text;
        } else if (!endPunct.test(prevText) && words < 8) {
          merged[merged.length - 1] += ' ' + seg.text;
        } else {
          merged.push(seg.text);
        }
      });
      // Capitalize first letter of each highlight
      pos.highlights = merged.map(highlight => 
        highlight.charAt(0).toUpperCase() + highlight.slice(1)
      );
    }
    positions.push(pos);
  }

  // ------------------- EDUCATION PARSING -----------------------------------
  const eduHeaderIdx = rightColumnLines.findIndex((l) => /^Education\b/i.test(l.text));
  if (eduHeaderIdx !== -1) {
    let idx = eduHeaderIdx + 1;
    while (idx < rightColumnLines.length) {
      // skip blank / noise lines
      if (isNoise(rightColumnLines[idx].text)) { idx++; continue; }

      // break if we reach another major section
      if (headerRe.test(rightColumnLines[idx].text) && !/^Education\b/i.test(rightColumnLines[idx].text)) {
        break;
      }

      const school = rightColumnLines[idx].text.trim();
      idx++;

      // move to degree line
      while (idx < rightColumnLines.length && isNoise(rightColumnLines[idx].text)) idx++;
      if (idx >= rightColumnLines.length) break;

      let degreeFieldStr = rightColumnLines[idx].text.trim();

      // accumulate additional lines that belong to the same degree/field
      const schoolFont = rightColumnLines[idx - 1].fontSize; // font of school line
      let look = idx + 1;
      while (look < rightColumnLines.length) {
        const t = rightColumnLines[look].text.trim();
        if (isNoise(t)) { look++; continue; }
        if (headerRe.test(t)) break;
        if (rightColumnLines[look].fontSize >= schoolFont - 0.01) break; // new school starts
        // stop at date-only or year-range line (starts new block)
        if (/^[\u2022•·]?\s*\(?[0-9]{4}(?:\s*[–-]\s*(Present|[0-9]{4}))?\)?$/.test(t)) break;
        degreeFieldStr += ' ' + t;
        look++;
      }
      idx = look - 1; // last consumed line for this entry

      // parse date range in degreeRaw or will fallback to separate line
      let start: string | undefined;
      let end: string | null | undefined;
      
      // Look for date patterns like "(September 2024 - June 2028)" or "(June 2022 - August 2022)"
      const fullDateMatch = degreeFieldStr.match(/·\s*\(([A-Za-z]+ \d{4})\s*-\s*([A-Za-z]+ \d{4}|Present)\)$/);
      if (fullDateMatch) {
        start = fullDateMatch[1];
        const endVal = fullDateMatch[2];
        end = /Present/i.test(endVal) ? null : endVal;
        degreeFieldStr = degreeFieldStr.replace(/·\s*\([^)]+\)$/, '').trim();
      } else {
        // Fallback to original year-only pattern
        const dateMatch = degreeFieldStr.match(/(?:[\u2022•·]\s*)?\(?([0-9]{4})(?:\s*[–-]\s*(Present|[0-9]{4}))?\)?$/);
        if (dateMatch) {
          start = dateMatch[1];
          const endVal = dateMatch[2];
          end = endVal ? (/Present/i.test(endVal) ? null : endVal) : null;
          degreeFieldStr = degreeFieldStr.slice(0, degreeFieldStr.indexOf(dateMatch[0])).trim();
        }
      }

      // remove trailing bullets / separators
      degreeFieldStr = degreeFieldStr.replace(/[\u2022•·]+$/,'').trim().replace(/,+$/,'');

      const degreeSet = new Set(['PHD','MSC','MS','MBA','MD','BS','BA','BSC','BACHELOR','MASTER','DOCTOR','SECONDARY']);
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
        } else if (/Secondary Education/i.test(lhsTrim)) {
          degree = lhsTrim;
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
        } else if (/Secondary Education/i.test(degreeFieldStr)) {
          degree = "Secondary Education";
          field = degreeFieldStr.replace(/Secondary Education,?\s*/i, '').trim() || undefined;
        } else {
          field = degreeFieldStr;
        }
      }

      if (!start) {
        let probe = idx + 1;
        while (probe < rightColumnLines.length && isNoise(rightColumnLines[probe].text)) probe++;
        if (probe < rightColumnLines.length) {
          const m = rightColumnLines[probe].text.trim().match(/^[\u2022•·]?\s*\(?([0-9]{4})\)?$/);
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

  // ------------------- SKILLS PARSING (LEFT COLUMN) ------------------------
  const skills: JSONResumeSkill[] = [];
  const skillsHeaderIdx = leftColumnLines.findIndex((l) => /^(Top Skills|Skills)$/i.test(l.text));
  
  if (skillsHeaderIdx !== -1) {
    let idx = skillsHeaderIdx + 1;
    
    while (idx < leftColumnLines.length) {
      const line = leftColumnLines[idx];
      const txt = line.text.trim();
      
      // Skip empty lines
      if (!txt) { idx++; continue; }
      
      // Break if we reach another major section
      if (/^(Contact|Education|Experience|Certifications?|Publications?|Languages?|Projects?)$/i.test(txt)) {
        break;
      }
      
      // Skills are typically in smaller font (10.5) compared to headers (13) and summary text (12)
      // Skip summary text (larger font, longer lines)
      if (line.fontSize >= 12 && txt.length > 50) {
        idx++;
        continue;
      }
      
      // This looks like a skill - shorter text, smaller font
      if (line.fontSize <= 11 && txt.length <= 50) {
        skills.push({
          name: txt
        });
      }
      
      idx++;
    }
  }

  // ------------------- CERTIFICATES PARSING (LEFT COLUMN) ------------------
  const certificates: JSONResumeCertificate[] = [];
  const certificatesHeaderIdx = leftColumnLines.findIndex((l) => /^(Certifications?|Licenses?)$/i.test(l.text));
  
  if (certificatesHeaderIdx !== -1) {
    let idx = certificatesHeaderIdx + 1;
    
    while (idx < leftColumnLines.length) {
      const line = leftColumnLines[idx];
      const txt = line.text.trim();
      
      // Skip empty lines
      if (!txt) { idx++; continue; }
      
      // Break if we reach another major section
      if (/^(Contact|Education|Experience|Top Skills|Skills|Publications?|Languages?|Projects?)$/i.test(txt)) {
        break;
      }
      
      // Certificates are typically in smaller font (10.5) compared to headers (13)
      // Skip summary text (larger font, longer lines)
      if (line.fontSize >= 12 && txt.length > 50) {
        idx++;
        continue;
      }
      
      // This looks like a certificate - shorter text, smaller font
      if (line.fontSize <= 11 && txt.length <= 100) {
        certificates.push({
          name: txt
        });
      }
      
      idx++;
    }
  }

  // ------------------- LANGUAGES PARSING (LEFT COLUMN) ---------------------
  const languages: JSONResumeLanguage[] = [];
  const languagesHeaderIdx = leftColumnLines.findIndex((l) => /^Languages?$/i.test(l.text));
  
  if (languagesHeaderIdx !== -1) {
    let idx = languagesHeaderIdx + 1;
    
    while (idx < leftColumnLines.length) {
      const line = leftColumnLines[idx];
      const txt = line.text.trim();
      
      // Skip empty lines
      if (!txt) { idx++; continue; }
      
      // Break if we reach another major section
      if (/^(Contact|Education|Experience|Top Skills|Skills|Certifications?|Publications?|Projects?)$/i.test(txt)) {
        break;
      }
      
      // Languages are typically in smaller font (10.5) compared to headers (13)
      if (line.fontSize >= 12) {
        idx++;
        continue;
      }
      
      // Look for language entries with potential fluency level
      if (line.fontSize <= 11) {
        let languageName = txt;
        let fluency: string | undefined;
        
        // Check if fluency is in the same line (in parentheses)
        const inlineMatch = txt.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (inlineMatch) {
          languageName = inlineMatch[1].trim();
          fluency = inlineMatch[2].trim();
        } else {
          // Check if next line might be fluency level (in parentheses)
          if (idx + 1 < leftColumnLines.length) {
            const nextLine = leftColumnLines[idx + 1];
            const nextTxt = nextLine.text.trim();
            if (/^\([^)]+\)$/.test(nextTxt) && nextLine.fontSize <= 11) {
              fluency = nextTxt.replace(/[()]/g, '');
              idx++; // consume the fluency line
            }
          }
        }
        
        languages.push({
          language: languageName,
          ...(fluency ? { fluency } : {})
        });
      }
      
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
      ...(p.location ? { location: p.location } : {}),
      startDate: toIso(p.start) ?? undefined,
      endDate: toIso(p.end) ?? null,
      ...(p.summary ? { summary: p.summary } : {}),
      ...(p.url ? { url: p.url } : {}),
      ...(p.highlights ? { highlights: p.highlights } : {}),
    })),
    education: education.map((e) => ({
      institution: e.school,
      studyType: e.degree || undefined,
      area: e.field || undefined,
      startDate: e.start ?? undefined,
      endDate: e.end ?? undefined,
    })),
    ...(skills.length > 0 ? { skills } : {}),
    ...(certificates.length > 0 ? { certificates } : {}),
    ...(languages.length > 0 ? { languages } : {}),
  };
}
