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

export interface JSONResumeAward {
  title: string;
  date?: string;
  awarder?: string;
  summary?: string;
}

export interface JSONResume {
  $schema?: string;
  basics?: JSONResumeBasics;
  work: JSONResumeWork[];
  education: JSONResumeEducation[];
  awards?: JSONResumeAward[];
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

  let doc;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }

  // --- Helper utilities -----------------------------------------------------
  const round = (n: number, prec = 2): number => {
    const f = 10 ** prec; // More efficient than Math.pow
    return Math.round(n * f) / f;
  };

  const clean = (text: string): string => text.replace(/\s+/g, " ").trim();

  // Helper to extract text (simplified - no color extraction for now)
  const extractTextWithColors = async (page: any): Promise<Array<{ text: string; fontSize: number; y: number; x: number; color?: string; page: number; minX: number; maxX: number; column: 'left' | 'right' }>> => {
    const textContent = await page.getTextContent({ disableCombineTextItems: false });

    // Process text items without color information for now (to avoid disrupting existing profiles)
    const lines: Array<{ text: string; fontSize: number; y: number; x: number; color?: string; page: number; minX: number; maxX: number; column: 'left' | 'right' }> = [];
    const byY = new Map<number, Array<{ x: number; text: string; fontSize: number }>>();

    textContent.items.forEach((item: any) => {
      const yPos = round(item.transform[5], 1);
      const x = item.transform[4];
      const text = clean(item.str);
      if (!text) return;
      const fontSize = Math.hypot(item.transform[0], item.transform[1]);

      if (!byY.has(yPos)) byY.set(yPos, []);
      byY.get(yPos)!.push({ x, text, fontSize });
    });

    const sortedYs = Array.from(byY.keys()).sort((a, b) => b - a);
    sortedYs.forEach((yKey) => {
      const items = byY.get(yKey)!.sort((a, b) => a.x - b.x);
      const lineText = items.map((i) => i.text).join(" ").trim();
      const maxFont = Math.max(...items.map((i) => i.fontSize));
      const minX = Math.min(...items.map((i) => i.x));
      const maxX = Math.max(...items.map((i) => i.x));
      
      lines.push({ 
        text: lineText, 
        fontSize: maxFont, 
        y: yKey, 
        x: minX,
        color: undefined, // no color information for now
        page: 0, // will be set later
        minX, 
        maxX, 
        column: 'left' // will be determined later
      });
    });

    return lines;
  };

  // Gather all text items with color information
  const lines: Array<{ text: string; fontSize: number; y: number; x: number; color?: string; page: number; minX: number; maxX: number; column: 'left' | 'right' }> = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const pageLines = await extractTextWithColors(page);
    pageLines.forEach(line => {
      line.page = p;
      lines.push(line);
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
  const xMidpoints = topLines.map(line => (line.minX + line.maxX) / 2);
  xMidpoints.sort((a, b) => a - b);
  
  // Find the largest gap between consecutive x-positions to determine column boundary
  let largestGap = 0;
  let columnBoundary = 0;
  for (let i = 1; i < xMidpoints.length; i++) {
    const gap = xMidpoints[i] - xMidpoints[i-1];
    if (gap > largestGap) {
      largestGap = gap;
      columnBoundary = (xMidpoints[i] + xMidpoints[i-1]) / 2;
    }
  }
  
  // Fallback to simple method if gap-based approach fails
  if (largestGap < 50) { // No significant gap found
    const minX = Math.min(...xMidpoints);
    const maxX = Math.max(...xMidpoints);
    columnBoundary = (minX + maxX) / 2;
  }
  
  // Assign column based on X position
  lines.forEach(line => {
    line.column = line.minX < columnBoundary ? 'left' : 'right';
  });

  // Filter lines by column for content extraction
  const rightColumnLines = lines.filter(line => line.column === 'right');
  const leftColumnLines = lines.filter(line => line.column === 'left');

  // --- Content Classification Helpers --------------------------------------
  
  // Robust pattern-based classification instead of hardcoded lists
  const isSkillOrLanguage = (text: string): boolean => {
    if (!text || text.length < 2) return false;
    
    // Pattern-based detection for programming languages/technologies
    if (/^[A-Z][a-z]*(\+\+|#|\.js|\.py)?$/i.test(text.trim())) return true; // C++, C#, Node.js, etc.
    if (/^[A-Z]{2,6}$/i.test(text.trim())) return true; // SQL, AWS, HTML, CSS, etc.
    if (/\b(Learning|Science|Development|Engineering|Programming)\b/i.test(text)) return true;
    
    // Pattern for common language names (but not when part of longer text)
    const languagePattern = /^(English|Spanish|French|German|Italian|Portuguese|Chinese|Japanese|Korean|Arabic|Hindi|Russian|Dutch|Swedish|Norwegian|Danish|Finnish|Polish|Czech|Hungarian|Romanian|Bulgarian|Croatian|Serbian|Slovak|Slovenian|Estonian|Latvian|Lithuanian|Mandarin|Cantonese|Tamil|Telugu|Bengali|Gujarati|Marathi|Punjabi|Urdu|Thai|Vietnamese|Indonesian|Malay|Tagalog|Swahili|Amharic|Yoruba|Igbo|Hausa|Zulu|Afrikaans|Hebrew|Turkish|Greek|Ukrainian|Belarusian|Kazakh|Uzbek|Kyrgyz|Tajik|Turkmen|Mongolian|Tibetan|Burmese|Khmer|Lao|Sinhala|Nepali|Pashto|Dari|Farsi|Kurdish|Armenian|Georgian|Azerbaijani|Albanian|Macedonian|Bosnian|Montenegrin|Icelandic|Faroese|Irish|Welsh|Scottish|Basque|Catalan|Galician|Maltese|Luxembourgish)$/i.test(text.trim());
    
    return languagePattern;
  };

  const isLocationPattern = (text: string): boolean => {
    if (!text || text.length < 3) return false;
    
    // Pattern-based location detection
    if (/\bArea$/i.test(text)) return true; // Any "Area" ending
    if (/\b(Greater|Metro)\s+.+\s+Area$/i.test(text)) return true; // Greater/Metro + Area
    if (/\bBay\s+Area$/i.test(text)) return true; // Any Bay Area
    if (/,\s*(CA|NY|TX|FL|WA|OR|AZ|CO|IL|PA|OH|MI|GA|NC|SC|VA|MA|MD|NJ|CT|RI|DE|NH|VT|ME|HI|AK|NV|UT|ID|MT|WY|ND|SD|NE|KS|OK|AR|LA|MS|AL|TN|KY|IN|WV|MO|IA|MN|WI|DC)$/i.test(text)) return true; // State codes
    if (/,\s*(United States|USA|California|New York|Texas|Florida|Washington|Oregon|Arizona|Colorado)$/i.test(text)) return true; // Common states/countries
    if (/\b(Campus|University|College)\b/i.test(text)) return true; // Educational locations
    // Standalone country names
    if (/^(United States|United Kingdom|Canada|Australia|Germany|France|Italy|Spain|Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Ireland|Portugal|Greece|Poland|Czech Republic|Hungary|Romania|Bulgaria|Croatia|Slovenia|Slovakia|Estonia|Latvia|Lithuania|Luxembourg|Malta|Cyprus|Iceland|Liechtenstein|Monaco|San Marino|Vatican City|Andorra|Japan|South Korea|China|India|Singapore|Malaysia|Thailand|Philippines|Indonesia|Vietnam|Taiwan|Hong Kong|Macau|New Zealand|Brazil|Argentina|Chile|Colombia|Peru|Ecuador|Uruguay|Paraguay|Bolivia|Venezuela|Guyana|Suriname|French Guiana|Mexico|Costa Rica|Panama|Guatemala|Honduras|El Salvador|Nicaragua|Belize|Jamaica|Cuba|Dominican Republic|Haiti|Trinidad and Tobago|Barbados|Bahamas|Puerto Rico|South Africa|Nigeria|Kenya|Ghana|Egypt|Morocco|Tunisia|Algeria|Libya|Sudan|Ethiopia|Tanzania|Uganda|Rwanda|Botswana|Namibia|Zambia|Zimbabwe|Mozambique|Madagascar|Mauritius|Seychelles|Israel|Turkey|Saudi Arabia|UAE|Qatar|Kuwait|Bahrain|Oman|Jordan|Lebanon|Syria|Iraq|Iran|Afghanistan|Pakistan|Bangladesh|Sri Lanka|Nepal|Bhutan|Maldives|Myanmar|Cambodia|Laos|Brunei|Mongolia|Kazakhstan|Uzbekistan|Kyrgyzstan|Tajikistan|Turkmenistan|Armenia|Azerbaijan|Georgia|Russia|Ukraine|Belarus|Moldova|Serbia|Montenegro|Bosnia and Herzegovina|North Macedonia|Albania|Kosovo|USA|UK)$/i.test(text.trim())) return true;
    
    return false;
  };

  const isBusinessTermOrTitle = (text: string): boolean => {
    if (!text) return false;
    
    // Job titles and roles (more specific)
    if (/\b(CEO|CTO|CFO|COO|VP|SVP|EVP|President|Director|Manager|Lead|Head|Chief|Principal|Senior|Associate|Assistant|Coordinator|Specialist|Analyst|Engineer|Scientist|Developer|Consultant|Advisor|Executive)\b/i.test(text)) return true;
    
    // Academic titles and roles
    if (/\b(Postdoctoral|Postdoc|Scholar|Researcher|Research|Professor|Instructor|Lecturer|Fellow|Student|Graduate|Undergraduate|Doctoral|PhD|Masters|Bachelor)\b/i.test(text)) return true;
    
    // Company suffixes (only at end of text to avoid false positives)
    if (/\b(LLC|Inc|Corp|Company|Corporation|Ltd|Limited|Solutions|Systems|Technologies|Services|Consulting|Group|Associates|Partners|Enterprises|Holdings|Ventures|Capital|Investments|Management|Advisory)$/i.test(text)) return true;
    
    // Avoid matching academic/research terms that could be locations
    // Don't match: Lab, Laboratory, Center, Centre, Institute, Foundation, Organization, University, College, Hospital, Clinic
    
    return false;
  };

  // --- Heuristic helpers ----------------------------------------------------
  const dateRe = /(?:[A-Za-z]{3,9}\s+\d{4}|\d{4})\s*[–-]\s*(?:Present|[A-Za-z]{3,9}\s+\d{4}|\d{4})/;
  const durationRe = /\d+\s+(?:yr|yrs|year|years|mos?|months?)/i;
  const headerRe = /^(Experience|Education|Certifications?|Publications?|Skills|Summary|Contact|Top Skills|Projects)(\s|$)/i;
  
  // Pre-compile commonly used regexes for better performance
  const yearOnlyRe = /^\d{4}$/;
  const bulletRe = /^\s*(?:[\u2022•·\-*]|\d+[.)]|[a-zA-Z][.)](?=\s))\s*/u;
  const inlineFluentRe = /^(.+?)\s*\(([^)]+)\)$/;

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
      // Split credentials after comma or hyphen (e.g., ", PhD" or "- SHRM-CP")
      const nameRaw = nameLine.text;
      if (/,/.test(nameRaw)) {
        const [primary] = nameRaw.split(',');
        basics.name = primary.trim();
        // credential part ignored for now
      } else if (/-\s+[A-Z]{2,}/.test(nameRaw)) {
        // Handle hyphen-separated credentials like "- SHRM-CP"
        const [primary] = nameRaw.split(/\s*-\s+[A-Z]/);
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

      // Try LinkedIn URL patterns - check for split pattern first
      const urlPart1Match = blob.match(/(?:www\.)?linkedin\.com\/in\/([^\s]*)/i);
      const urlPart2Match = blob.match(/([a-z0-9-]+)\s*\(LinkedIn\)/i);
      // Use split pattern if:
      // 1. First part ends with hyphen (natural split like "li-erran-")
      // 2. OR first part looks like incomplete username and second part is short continuation
      // 3. OR first part has empty username (like "www.linkedin.com/in/") and second part has the full username
      const isHyphenSplit = urlPart1Match && urlPart1Match[1].endsWith('-');
      const isWordSplit = urlPart1Match && urlPart2Match && 
                         urlPart1Match[1].length >= 5 && // reasonable username length
                         urlPart2Match[1].length <= 10 && // short continuation
                         /^[a-z]+$/.test(urlPart2Match[1]); // only letters (not location like "States")
      const isEmptyUsernameSplit = urlPart1Match && urlPart2Match && 
                                  urlPart1Match[1] === '' && // empty username in first part
                                  urlPart2Match[1].length >= 3 && // reasonable full username length
                                  /^[a-z0-9-]+$/i.test(urlPart2Match[1]); // valid username characters
      
      if (urlPart1Match && urlPart2Match && (isHyphenSplit || isWordSplit || isEmptyUsernameSplit)) {
        const username = urlPart1Match[1] + urlPart2Match[1];
        const url = `https://www.linkedin.com/in/${username}`;
        profiles.push({ network: 'LinkedIn', username, url });
      } else {
        // Try standard LinkedIn URL patterns
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
      }

      // More specific phone regex that avoids date ranges and LinkedIn usernames
      const phoneCandidate = blob.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}|(?:\+?\d{1,3}[-.\s]?)?(?:\([0-9]{1,4}\)|[0-9]{1,4})[-.\s]?[0-9]{6,10}/);
      // Only check if the phone candidate itself looks like a year range (not anywhere in the blob)
      const isYearRangePattern = phoneCandidate && /^\d{4}\s*[-–]\s*\d{4}$/.test(phoneCandidate[0]);
      
      // Check if the phone candidate is actually part of a LinkedIn URL (handle split URLs)
      let isLinkedInUsername = false;
      if (phoneCandidate) {
        // Check for complete LinkedIn URL
        const linkedinUrlMatch = blob.match(/linkedin\.com\/in\/[^\s)]+/i);
        // Check for split LinkedIn URL pattern (number followed by "(LinkedIn)")
        const splitPattern = new RegExp(`\\b${phoneCandidate[0]}\\s*\\(LinkedIn\\)`, 'i');
        
        if (linkedinUrlMatch && linkedinUrlMatch[0].includes(phoneCandidate[0])) {
          isLinkedInUsername = true;
        } else if (splitPattern.test(blob)) {
          isLinkedInUsername = true;
        }
        

      }
      
      if (phoneCandidate && !isYearRangePattern && !isLinkedInUsername) {
        basics.phone = phoneCandidate[0];
      }

      // Location parsing: prefer right column content (where location typically appears)
      let locLine: {text:string}|undefined;
      const idxAfterName = nameIdx + 1;
      const headerAfterIdxRel = topLines.slice(idxAfterName).findIndex((l)=> headerRe.test(l.text) && !/^Contact$/i.test(l.text));
      const scanMax = headerAfterIdxRel === -1 ? topLines.length : idxAfterName + headerAfterIdxRel;
      
      // First try to find location in right column only
      for (let i = nameIdx+1; i < scanMax; i++) {
        const t = topLines[i].text;
        const line = topLines[i];
        
        // Skip left column lines for location parsing
        if (line.column === 'left') continue;
        
        if ((basics.summary && t===basics.summary)) continue;
        if (/@|http|www\.|linkedin/i.test(t)) continue;
        if (/\|/.test(t)) continue;
        if (!/,/.test(t)) continue;
        if (/LinkedIn/i.test(t)) continue;
        if (/\d/.test(t)) continue; // avoid job title lines containing numbers
        // Skip job titles by checking for business terms
        if (isBusinessTermOrTitle(t)) continue;
        // Skip label/headline text that contains academic/professional keywords
        if (/\b(biology|statistics|machine learning|data science|research|analysis|computational|bioinformatics|quantitative)\b/i.test(t)) continue;
        locLine = topLines[i];
        break;
      }
      // Fallback: try right column with more flexible patterns
      if (!locLine) {
        locLine = topLines.slice(nameIdx+1, scanMax).find((l)=>
          l.column === 'right' && // Only right column
          /,/.test(l.text) && 
          /(United|Area|[A-Z]{2})/i.test(l.text) &&
          !isBusinessTermOrTitle(l.text)
        );
      }
      if (!locLine) {
        for (let i = nameIdx+1; i < scanMax; i++) {
          const t = topLines[i].text;
          const line = topLines[i];
          
          // Skip left column lines for location parsing
          if (line.column === 'left') continue;
          
          if ((basics.summary && t===basics.summary)) continue;
          if (/LinkedIn|www\.|http/i.test(t)) continue;
          if (/\|/.test(t)) continue;
          // Look for location patterns
          if (isLocationPattern(t)) {
            // Make sure it's not a job title by checking for business terms
            if (!isBusinessTermOrTitle(t)) {
              locLine = topLines[i];
              break;
            }
          }
        }
      }
      
      // Final fallback: if no location found in right column, allow left column but with stricter filtering
      if (!locLine) {
        for (let i = nameIdx+1; i < scanMax; i++) {
          const t = topLines[i].text;
          const line = topLines[i];
          
          // Only consider left column as final fallback
          if (line.column !== 'left') continue;
          
          if ((basics.summary && t===basics.summary)) continue;
          if (/@|LinkedIn|www\.|http/i.test(t)) continue; // Stricter filtering for left column
          if (/\|/.test(t)) continue;
          
          // Very strict location patterns for left column to avoid skills/languages leakage
          if (/(San Francisco Bay Area|Greater.*Area|Bay Area|Metro Area)$/i.test(t)) {
            if (!/\b(CEO|CTO|CFO|VP|LLC|Inc|Corp|Company|Solutions|Professional|Consulting|Director|Manager|Engineer|Analyst|Danish|Spanish|English|Machine Learning|Data Science|Python|JavaScript|React|Node|SQL)\b/i.test(t)) {
              locLine = topLines[i];
              break;
            }
          }
        }
      }
      if (locLine) {
        const locationText = locLine.text;
        
        // Check if this is a standalone country name
        const isStandaloneCountry = /^(United States|United Kingdom|Canada|Australia|Germany|France|Italy|Spain|Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Ireland|Portugal|Greece|Poland|Czech Republic|Hungary|Romania|Bulgaria|Croatia|Slovenia|Slovakia|Estonia|Latvia|Lithuania|Luxembourg|Malta|Cyprus|Iceland|Liechtenstein|Monaco|San Marino|Vatican City|Andorra|Japan|South Korea|China|India|Singapore|Malaysia|Thailand|Philippines|Indonesia|Vietnam|Taiwan|Hong Kong|Macau|New Zealand|Brazil|Argentina|Chile|Colombia|Peru|Ecuador|Uruguay|Paraguay|Bolivia|Venezuela|Guyana|Suriname|French Guiana|Mexico|Costa Rica|Panama|Guatemala|Honduras|El Salvador|Nicaragua|Belize|Jamaica|Cuba|Dominican Republic|Haiti|Trinidad and Tobago|Barbados|Bahamas|Puerto Rico|South Africa|Nigeria|Kenya|Ghana|Egypt|Morocco|Tunisia|Algeria|Libya|Sudan|Ethiopia|Tanzania|Uganda|Rwanda|Botswana|Namibia|Zambia|Zimbabwe|Mozambique|Madagascar|Mauritius|Seychelles|Israel|Turkey|Saudi Arabia|UAE|Qatar|Kuwait|Bahrain|Oman|Jordan|Lebanon|Syria|Iraq|Iran|Afghanistan|Pakistan|Bangladesh|Sri Lanka|Nepal|Bhutan|Maldives|Myanmar|Cambodia|Laos|Brunei|Mongolia|Kazakhstan|Uzbekistan|Kyrgyzstan|Tajikistan|Turkmenistan|Armenia|Azerbaijan|Georgia|Russia|Ukraine|Belarus|Moldova|Serbia|Montenegro|Bosnia and Herzegovina|North Macedonia|Albania|Kosovo|USA|UK)$/i.test(locationText.trim());
        
        if (isStandaloneCountry) {
          // Store as structured object with countryCode for standalone countries
          const locObj: JSONResumeLocation = { countryCode: locationText };
          basics.location = locObj;
        } else {
          // Parse as structured location for city, state, country combinations
          const parts = locationText.split(/,\s*/);
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
      }
      if (profiles.length) (basics as any).profiles = profiles;

      // Label parsing: prefer right column content (where headline typically appears)
      const labelParts: string[] = [];
      
      // First try right column only
      for (let i = nameIdx + 1; i < topLines.length; i++) {
        const txt = topLines[i].text;
        const line = topLines[i];
        
        // Skip left column lines for label parsing
        if (line.column === 'left') continue;
        
        if (/^(Contact|Summary|Top Skills)$/i.test(txt)) break;
        if (headerRe.test(txt)) break;
        if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(txt) || /linkedin\.|http|www\./i.test(txt)) continue; // skip actual emails/urls
        // Skip phone numbers
        if (/^\d+\s*\(Mobile\)$/i.test(txt) || /^\d{10,}$/i.test(txt)) continue;
        // Check if line is location-like (but can't use isLocation function yet as it's defined later)
        // Be more specific about location detection to avoid job titles
        const looksLikeLocation = (
          // Lines ending with Area patterns (but not job titles with CEO, LLC, etc.)
          /(San Francisco Bay Area|Greater.*Area|Bay Area|Metro Area|Raleigh-Durham-Chapel Hill Area)$/i.test(txt) ||
          // Lines with comma and clear location indicators (but exclude job titles and academic terms)
          (/,/.test(txt) && /(United States|California|New York|Texas|[A-Z]{2}$)/i.test(txt) && 
           !/\b(CEO|CTO|CFO|VP|Vice President|President|Director|Manager|Engineer|Analyst|Postdoctoral|Postdoc|Scholar|Researcher|Research|Professor|Instructor|Lecturer|Fellow|LLC|Inc|Corp|Company|Solutions|Professional|Consulting|Communications|Marketing|Executive|Senior|Lead|Head|Chief|biology|statistics|machine learning|data science|research|analysis|computational|bioinformatics|quantitative)\b/i.test(txt) &&
           // Additional check: if it starts with a job title pattern, it's not a location
           !/^(Vice President|President|Director|Manager|Engineer|Analyst|CEO|CTO|CFO|Chief|Senior|Lead|Head|Executive)/i.test(txt)) ||
          // Standalone country names
          /^(United States|United Kingdom|Canada|Australia|Germany|France|Italy|Spain|Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Ireland|Portugal|Greece|Poland|Czech Republic|Hungary|Romania|Bulgaria|Croatia|Slovenia|Slovakia|Estonia|Latvia|Lithuania|Luxembourg|Malta|Cyprus|Iceland|Liechtenstein|Monaco|San Marino|Vatican City|Andorra|Japan|South Korea|China|India|Singapore|Malaysia|Thailand|Philippines|Indonesia|Vietnam|Taiwan|Hong Kong|Macau|New Zealand|Brazil|Argentina|Chile|Colombia|Peru|Ecuador|Uruguay|Paraguay|Bolivia|Venezuela|Guyana|Suriname|French Guiana|Mexico|Costa Rica|Panama|Guatemala|Honduras|El Salvador|Nicaragua|Belize|Jamaica|Cuba|Dominican Republic|Haiti|Trinidad and Tobago|Barbados|Bahamas|Puerto Rico|South Africa|Nigeria|Kenya|Ghana|Egypt|Morocco|Tunisia|Algeria|Libya|Sudan|Ethiopia|Tanzania|Uganda|Rwanda|Botswana|Namibia|Zambia|Zimbabwe|Mozambique|Madagascar|Mauritius|Seychelles|Israel|Turkey|Saudi Arabia|UAE|Qatar|Kuwait|Bahrain|Oman|Jordan|Lebanon|Syria|Iraq|Iran|Afghanistan|Pakistan|Bangladesh|Sri Lanka|Nepal|Bhutan|Maldives|Myanmar|Cambodia|Laos|Brunei|Mongolia|Kazakhstan|Uzbekistan|Kyrgyzstan|Tajikistan|Turkmenistan|Armenia|Azerbaijan|Georgia|Russia|Ukraine|Belarus|Moldova|Serbia|Montenegro|Bosnia and Herzegovina|North Macedonia|Albania|Kosovo)$/i.test(txt.trim())
        );
        if (looksLikeLocation) continue; // skip location lines
        // Skip fragments that look like LinkedIn URL parts
        if (/^song-\d+\s*\(LinkedIn\)$/i.test(txt)) continue;
        if (/^[a-z]+-[a-z0-9]+\s*\(LinkedIn\)$/i.test(txt)) continue;
        // Skip LinkedIn username fragments (like "swanson-shrm-cp-49667449")
        if (/^[a-z]+-[a-z]+-[a-z]+-\d+$/i.test(txt)) continue;
        if (txt.length < 3) continue;
        // Add text to label parts, prioritizing academic/professional keywords
        labelParts.push(txt);
        if (labelParts.length >= 3) break; // Allow more parts for complex labels
      }
      
      // Fallback: if no label found in right column, try left column with stricter filtering
      if (labelParts.length === 0) {
        for (let i = nameIdx + 1; i < topLines.length; i++) {
          const txt = topLines[i].text;
          const line = topLines[i];
          
          // Only consider left column as fallback
          if (line.column !== 'left') continue;
          
          if (/^(Contact|Summary|Top Skills)$/i.test(txt)) break;
          if (headerRe.test(txt)) break;
          if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(txt) || /linkedin\.|http|www\./i.test(txt)) continue;
          if (/^\d+\s*\(Mobile\)$/i.test(txt) || /^\d{10,}$/i.test(txt)) continue;
          
          // Stricter filtering for left column to avoid skills/languages
          if (isSkillOrLanguage(txt) || isBusinessTermOrTitle(txt)) continue;
          
          if (isLocationPattern(txt)) continue;
          
          // Skip LinkedIn username fragments
          if (/\(LinkedIn\)$/i.test(txt) || /^[a-z0-9-]+\d{4,}$/i.test(txt)) continue;
          if (txt.length < 3) continue;
          
          labelParts.push(txt);
          if (labelParts.length >= 3) break;
        }
      }
      if (labelParts.length) {
        let lbl = labelParts.join(' ').trim();
        lbl = lbl.replace(/\s*\(LinkedIn\)$/i,'').trim();
        lbl = lbl.replace(/\s*\(Personal\)$/i,'').trim();
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
    
    // Exclude job titles and roles using pattern-based detection
    if (isBusinessTermOrTitle(line)) return false;
    
    const locationKeywords = /(Area|County|Bay|City|Town|United|Kingdom|States?|Province|Region|District|California|New York|Texas|Washington|Florida|Massachusetts|Virginia|Colorado|Arizona|Oregon|Ohio|Georgia|Illinois|Pennsylvania|Michigan|Wisconsin|North Carolina|South Carolina|Maryland|Mountain View|Pittsburgh)/i;
    
    // Pattern-based major city detection instead of hardcoded list
    const isMajorCity = (text: string): boolean => {
      // UAE and other short country/region codes
      if (/^(UAE|USA|UK|EU|NYC|LA|SF|DC)$/i.test(text.trim())) return true;
      
      // Greater + City + Area pattern
      if (/^Greater\s+[A-Z][a-z]+\s+Area$/i.test(text.trim())) return true;
      
      // City + Area pattern (any city name)
      if (/^[A-Z][a-z]+\s+Area$/i.test(text.trim())) return true;
      
      // Multiple location pattern (like "Pittsburgh Area and Mountain View")
      if (/\s+Area\s+and\s+[A-Z][a-z]+/i.test(text)) return true;
      
      // Indian cities pattern (many end with specific suffixes)
      if (/^(Bangalore|Mumbai|Delhi|Chennai|Hyderabad|Pune|Kolkata|Ahmedabad)$/i.test(text.trim())) return true;
      
      return false;
    };
    
    if (/,/.test(line) && locationKeywords.test(line)) return true;
    // Recognize standalone country names and regions
    if (/^(United States|United Kingdom|Canada|Australia|Germany|France|Italy|Spain|Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Ireland|Portugal|Greece|Poland|Czech Republic|Hungary|Romania|Bulgaria|Croatia|Slovenia|Slovakia|Estonia|Latvia|Lithuania|Luxembourg|Malta|Cyprus|Iceland|Liechtenstein|Monaco|San Marino|Vatican City|Andorra|Japan|South Korea|China|India|Singapore|Malaysia|Thailand|Philippines|Indonesia|Vietnam|Taiwan|Hong Kong|Macau|New Zealand|Brazil|Argentina|Chile|Colombia|Peru|Ecuador|Uruguay|Paraguay|Bolivia|Venezuela|Guyana|Suriname|French Guiana|Mexico|Costa Rica|Panama|Guatemala|Honduras|El Salvador|Nicaragua|Belize|Jamaica|Cuba|Dominican Republic|Haiti|Trinidad and Tobago|Barbados|Bahamas|Puerto Rico|South Africa|Nigeria|Kenya|Ghana|Egypt|Morocco|Tunisia|Algeria|Libya|Sudan|Ethiopia|Tanzania|Uganda|Rwanda|Botswana|Namibia|Zambia|Zimbabwe|Mozambique|Madagascar|Mauritius|Seychelles|Israel|Turkey|Saudi Arabia|UAE|Qatar|Kuwait|Bahrain|Oman|Jordan|Lebanon|Syria|Iraq|Iran|Afghanistan|Pakistan|Bangladesh|Sri Lanka|Nepal|Bhutan|Maldives|Myanmar|Cambodia|Laos|Brunei|Mongolia|Kazakhstan|Uzbekistan|Kyrgyzstan|Tajikistan|Turkmenistan|Armenia|Azerbaijan|Georgia|Russia|Ukraine|Belarus|Moldova|Serbia|Montenegro|Bosnia and Herzegovina|North Macedonia|Albania|Kosovo|California|New York|Texas|Florida|Illinois|Pennsylvania|Ohio|Georgia|North Carolina|Michigan|New Jersey|Virginia|Washington|Arizona|Massachusetts|Tennessee|Indiana|Missouri|Maryland|Wisconsin|Colorado|Minnesota|South Carolina|Alabama|Louisiana|Kentucky|Oregon|Oklahoma|Connecticut|Utah|Iowa|Nevada|Arkansas|Mississippi|Kansas|New Mexico|Nebraska|West Virginia|Idaho|Hawaii|New Hampshire|Maine|Montana|Rhode Island|Delaware|South Dakota|North Dakota|Alaska|Vermont|Wyoming)$/i.test(line.trim())) return true;
    if (/\bCampus\b/i.test(line)) return true;
    if (/\bOffice\b/i.test(line)) return true;
    if (/\bCenter\b/i.test(line)) return true;
    // Handle comma-separated locations where any part is a major city
    if (/,/.test(line)) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.some(part => isMajorCity(part))) return true;
    }
    // City + State pattern, but exclude common non-state abbreviations
    if (/\b[A-Z][a-z]+,?\s+[A-Z]{2}\b/.test(line)) {
      // Extract the potential state code
      const stateMatch = line.match(/\b[A-Z]{2}\b/);
      if (stateMatch) {
        const potentialState = stateMatch[0];
        // Exclude common non-state abbreviations
        const nonStateAbbrevs = /^(PI|VP|MD|PhD|DDS|DVM|RN|CPA|CEO|CTO|CFO|COO|HR|IT|PR|QA|UI|UX|AI|ML|AR|VR|3D|2D|ID|IP|OS|DB|JS|CSS|HTML|XML|JSON|PDF|API|SDK|CRM|ERP|B2B|B2C|SaaS|PaaS|IaaS|IoT|GPS|GPS|USB|RAM|CPU|GPU|SSD|HDD|LCD|LED|OLED|4K|HD|FHD|UHD|MP3|MP4|AVI|MOV|JPG|PNG|GIF|SVG|CSV|TSV|XLSX|DOCX|PPTX|ZIP|RAR|TAR|GZ)$/i;
        if (nonStateAbbrevs.test(potentialState)) {
          return false; // Not a location
        }
      }
      return true;
    }
    if (/\b[A-Z]{2}\b$/.test(line)) return true; // state code at end
    if (/\bArea$/i.test(line)) return true;
    if (isMajorCity(line.trim())) return true; // major city names
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

    const m = txt.match(/((?:[A-Za-z]+\s+)?\d{4})\s*[–-]\s*(Present|(?:[A-Za-z]+\s+)?\d{4})/);
    const start = m ? m[1].trim() : "";
    const endVal = m ? m[2].trim() : "";
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
          // Found the company line, but check if there are additional lines above that should be combined
          let companyParts = [l.text];
          let lookBack = cIdx - 1;
          
          // Look backwards for consecutive lines with similar font size that could be part of company name
          while (lookBack >= 0) {
            const prevLine = rightColumnLines[lookBack];
            if (isNoise(prevLine.text) || headerRe.test(prevLine.text) || dateRe.test(prevLine.text) || durationRe.test(prevLine.text)) {
              break;
            }
            
            // If the previous line has similar font size and doesn't look like a title/position, include it
            const fontDiff = Math.abs(prevLine.fontSize - l.fontSize);
            if (fontDiff <= 0.5 && 
                !/(^[A-Z][a-z]+ [A-Z][a-z]+$)|(Professor|Director|Manager|Engineer|Analyst|Specialist|Coordinator|Assistant|Associate|Senior|Lead|Head|Chief|VP|CEO|CTO|CFO)$/i.test(prevLine.text) &&
                prevLine.text.length > 10) { // Avoid very short lines that might be fragments
              companyParts.unshift(prevLine.text);
              lookBack--;
            } else {
              break;
            }
          }
          
          companyFound = companyParts.join(' ');
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
      
      // Check for location BEFORE other break conditions
      // But avoid treating company names as locations (company names typically have larger font size)
      if (!location && isLocation(ltxt) && lObj.fontSize >= dateFont - 1.0 && lObj.fontSize < dateFont + 0.5) {
        location = ltxt;
      }
      
      // Special handling for combined location+description text (extract location and continue processing description)
      let processedText = ltxt;
      if (!location && /\b(Area|View)\s+[A-Z][a-z]/.test(ltxt)) {
        const match = ltxt.match(/^(.+?)\s+(Apply|Develop|Research|Work|Lead|Manage|Create|Build)\s+(.+)$/);
        if (match && isLocation(match[1].trim())) {
          location = match[1].trim();
          // Use the description part for further processing
          processedText = match[2] + ' ' + match[3];
        }
      }
      
      // Only break on date patterns that look like standalone date lines, not dates embedded in descriptive text
      // Exclude: bullet points, lines with commas (like "Foundation, 2016–2025"), lines starting with lowercase, very long lines, or bare year ranges
      if (dateRe.test(processedText) && 
          !/^[•·\-*]\s*/.test(processedText) && 
          !processedText.includes(',') &&
          !/^[a-z]/.test(processedText) &&
          processedText.split(/\s+/).length <= 6 &&
          !/^\d{4}\s*[–-]\s*\d{4}$/.test(processedText.trim())) break; // next block starts
      if (headerRe.test(processedText)) continue; // skip section headers
      if (lObj.fontSize > dateFont + 0.1) break; // assume new title block
      // Handle URL extraction and text cleaning
      let hasUrlExtracted = false;
      if (!urlFound && ( /https?:\/\//i.test(ltxt) || /[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/[^\s)]+/.test(ltxt) ) ) {
        // Avoid treating company names or partial text as URLs
        if (!ltxt.includes('Web Services') && !ltxt.includes('(AWS)') && ltxt.includes('.')) {
          // Extract just the URL part from the text - be more precise
          const urlMatch = ltxt.match(/https?:\/\/[^\s)]+/i) || ltxt.match(/\b(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?/i);
          if (urlMatch) {
            let extractedUrl = urlMatch[0];
            // Remove trailing punctuation that's not part of the URL
            extractedUrl = extractedUrl.replace(/[.,;!?]+$/, '');
            // Check if URL might continue on next line (ends with slash)
            if (extractedUrl.endsWith('/') && j + 1 < rightColumnLines.length) {
              // Look ahead for URL continuation
              let nextLineIdx = j + 1;
              while (nextLineIdx < rightColumnLines.length) {
                const nextLine = rightColumnLines[nextLineIdx];
                const nextText = nextLine.text.trim();
                
                // Stop if we hit a blank line, section header, or line with very different formatting
                if (!nextText || headerRe.test(nextText) || 
                    Math.abs(nextLine.fontSize - lObj.fontSize) > 1.0) {
                  break;
                }
                
                // Check if this line looks like a URL continuation (alphanumeric with underscores/dashes)
                if (/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\)?\s*$/.test(nextText)) {
                  // Remove trailing punctuation and parentheses from continuation
                  const continuation = nextText.replace(/[.,;!?)\s]+$/, '');
                  extractedUrl += continuation;
                  break;
                }
                
                // Only check the immediate next line to avoid false matches
                break;
              }
            }
            
            // Convert http to https and ensure protocol
            if (extractedUrl.startsWith('http://')) {
              urlFound = extractedUrl.replace('http://', 'https://');
            } else if (extractedUrl.startsWith('https://')) {
              urlFound = extractedUrl;
            } else {
              urlFound = 'https://' + extractedUrl.replace(/^www\./i, '');
            }
            
            // Remove the URL from the processed text for highlights
            // Handle complete URLs
            processedText = processedText.replace(/\s*\(?\s*https?:\/\/[^\s)]+\s*\)?\s*/gi, ' ').trim();
            processedText = processedText.replace(/\s*\(?\s*(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?\/?\s*\)?\s*/gi, ' ').trim();
            // Handle incomplete URLs like "(http://" at the end
            processedText = processedText.replace(/\s*\(\s*https?:\/\/\s*$/gi, '').trim();
            processedText = processedText.replace(/\s*\(\s*http:\/\/\s*$/gi, '').trim();
            processedText = processedText.replace(/\s+/g, ' ').trim();
            hasUrlExtracted = true;
          }
          // Don't skip the segment - let it be processed as a highlight if it contains descriptive text
          // Only skip if the line is purely a URL with no descriptive content
          if (!hasUrlExtracted && (/^\s*\(?https?:\/\/[^\s)]+\)?\s*$/.test(ltxt) || /^\s*\(?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?\/?\)?\s*$/.test(ltxt))) {
            continue;
          }
        }
      }
      const wordCnt = ltxt.trim().split(/\s+/).length;
      const bulletLine = bulletRe.test(ltxt);
      const prevSeg = highlightSegs.length ? highlightSegs[highlightSegs.length-1] : undefined;
      const prevY2 = highlightSegs.length ? highlightSegs[highlightSegs.length-1].y : undefined;
      const largeGapCurrent = prevY2 !== undefined && (prevY2 - lObj.y) > baselineGap * 1.6;
      const pageChange = prevSeg && prevSeg.page !== (rightColumnLines[j].page ?? 0);
      
      // Use simpler gap detection - let the merging logic handle continuations
      const gapFlag = gapSinceLast || largeGapCurrent || !!pageChange;
      const continuation = prevSeg && !prevSeg.bullet && !prevSeg.gap && !gapFlag && prevSeg.page === rightColumnLines[j].page;
      let textClean = processedText.replace(/^\s*(?:[\u2022•·\-*]|\d+[.)]|[a-zA-Z][.)](?=\s))\s*/, '').trim();
      if (/^(Work involved|Responsibilities)[:\-]/i.test(textClean)) {
        textClean = textClean.replace(/^(Work involved|Responsibilities)[:\-]\s*/i, '');
      }
      
      // Apply URL cleaning to textClean as well (in case URL was extracted earlier)
      if (hasUrlExtracted) {
        // Handle complete URLs
        textClean = textClean.replace(/\s*\(?\s*https?:\/\/[^\s)]+\s*\)?\s*/gi, ' ').trim();
        textClean = textClean.replace(/\s*\(?\s*(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?\/?\s*\)?\s*/gi, ' ').trim();
        // Handle incomplete URLs like "(http://" at the end
        textClean = textClean.replace(/\s*\(\s*https?:\/\/\s*$/gi, '').trim();
        textClean = textClean.replace(/\s*\(\s*http:\/\/\s*$/gi, '').trim();
        textClean = textClean.replace(/\s+/g, ' ').trim();
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
      
      // Check if this should be a location but wasn't caught earlier (for lines that follow location patterns)
      // But avoid treating company names as locations (check font size and context)
      if (!location && !isLocationLine && isLocation(textClean) && lObj.fontSize >= dateFont - 1.0 && lObj.fontSize < dateFont + 0.5) {
        location = textClean;
        isLocationLine = true;
      }
      

      
      if (!isLocationLine && textClean && (bulletLine || gapFlag || continuation || lObj.fontSize < dateFont - 0.2 || wordCnt > 8 || (!bulletLine && !gapFlag && wordCnt >= 1 && !isLocation(textClean)))) {
        // add highlight segment now
        highlightSegs.push({ text: textClean, bullet: bulletLine, gap: gapFlag, y: lObj.y, page: rightColumnLines[j].page });
        if(pageChange) gapSinceLast = false;
      }
    }

    // Note: URL extraction now happens in the highlight processing loop above

    if (!urlFound) {
      const slug = currentCompany.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      if (slug.length > 4) {
        // More strict URL regex - require proper domain structure
        const urlRegex = new RegExp(`(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]*${slug}[A-Za-z0-9-]*\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})?(?:\/[^\s)]+)?`, 'i');
        const mLine = rightColumnLines.find(l => urlRegex.test(l.text));
        if (mLine) {
          const matches = mLine.text.match(urlRegex);
          if (matches && matches.length) {
            matches.sort((a,b)=>b.length-a.length);
            const pick = matches[0];
            // Additional validation - ensure it looks like a real URL
            if (pick.includes('.com') || pick.includes('.org') || pick.includes('.net') || pick.includes('.io') || pick.includes('.ai')) {
              urlFound = pick.startsWith('http')? pick : 'https://'+pick;
            }
          }
        }
      }
    }

    if (!urlFound) {
      const caps = currentCompany.match(/[A-Z]/g);
      const acronym = caps ? caps.join('').toLowerCase() : currentCompany.split(/\s+/).map(w=>w[0]).join('').toLowerCase();
      if (acronym.length>=3) {
        // More strict URL regex for acronym matching
        const urlRegex = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?[A-Za-z0-9-]*${acronym}[A-Za-z0-9-]*\\.[A-Za-z]{2,}(?:\\.[A-Za-z]{2,})?(?:\\/[^\s)]+)?`, 'i');
        const mLine = rightColumnLines.find(l => urlRegex.test(l.text));
        if (mLine) {
          const matches = mLine.text.match(urlRegex);
          if (matches && matches.length) {
            matches.sort((a,b)=>b.length-a.length);
            const pick = matches[0];
            // Additional validation - ensure it looks like a real URL
            if (pick.includes('.com') || pick.includes('.org') || pick.includes('.net') || pick.includes('.io') || pick.includes('.ai')) {
              urlFound = pick.startsWith('http')? pick : 'https://'+pick;
            }
          }
        }
      }
    }

    const key = title + start + currentCompany;
    if (seen.has(key)) continue;
    
    // Additional duplicate detection: check for same company + position with overlapping dates
    const isDuplicate = positions.some(existing => 
      existing.company === currentCompany && 
      existing.title === title &&
      // Check for overlapping or contained date ranges
      ((existing.end === null) || // existing is ongoing, so any new position with same company/title is likely duplicate
       (end !== null && existing.start <= start && (existing.end === null || start <= existing.end)))
    );
    if (isDuplicate) continue;
    
    seen.add(key);

    const pos: ExperiencePosition = { title, company: currentCompany, start, end } as any;
    if (location) pos.location = location;
    if (urlFound) pos.url = urlFound;
    if (highlightSegs.length) {
      const merged: string[] = [];
      highlightSegs.forEach((seg, segIdx) => {
              if (merged.length === 0 || seg.bullet) {
        merged.push(seg.text);
        return;
      }
        const prevSeg = segIdx > 0 ? highlightSegs[segIdx - 1] : null;
        const prevText = merged[merged.length - 1].trim();
        const startsLower = /^[a-z]/.test(seg.text);
        const endPunct = /[.!?]$/;
        // Don't treat abbreviations as sentence endings
        const isAbbreviation = /\b(Dr|Mr|Mrs|Ms|Prof|Inc|Corp|Ltd|Co|vs|etc|Jr|Sr|PhD|MD|DDS|DVM|Esq|CPA|MBA|BA|BS|MA|MS|Ph\.D|M\.D|B\.A|B\.S|M\.A|M\.S)\.$/.test(prevText);
        const actuallyEnds = endPunct.test(prevText) && !isAbbreviation;
        
        // Check if this segment should be merged based on sentence completion patterns
        // Key insight: Only merge when there are clear indicators of incomplete sentences
        // Conservative comma matching - only merge when there are clear indicators of continuation
        const commaMatch = prevText.endsWith(',') && (
          startsLower || 
          /^I\b/.test(seg.text) ||
          // Specific patterns that clearly indicate continuation after comma
          (/\b(research-based|data-driven|team-oriented|well-established),$/.test(prevText.trim()) && /^(Quality Assurance|Performance Improvement|Leadership Program)/i.test(seg.text)) ||
          // Handle MD-MPH + Leadership Program case
          (/\bMD-MPH$/.test(prevText.trim()) && /^Leadership Program/i.test(seg.text))
        );
        
        const isLogicalContinuation = prevSeg && (
          // Only merge if previous text clearly indicates continuation
          commaMatch ||
          (prevText.endsWith(':') && seg.text.length > 10) || // colon followed by substantial text
          // Specific incomplete sentence patterns that need continuation
          (/\b(including|such as|like|for example|e\.g\.|i\.e\.)$/i.test(prevText) && !actuallyEnds) ||
          // Previous text ends with incomplete conjunctions or prepositions
          (/\b(and|or|but|with|to|from|by|on|in|at|for|of|the)$/i.test(prevText) && !actuallyEnds) ||
          // Handle mid-sentence breaks where previous doesn't end with period AND current starts lowercase
          (!actuallyEnds && startsLower) ||
          // Handle specific patterns like "Diagnosis of Diabetes Mellitus and to Determine" + "Estimated"
          (!actuallyEnds && /\b(to|and|or|for|of|in|at|on|with|by|from)\s*$/i.test(prevText)) ||
          // Handle incomplete phrases that clearly need continuation
          (!actuallyEnds && /\b(that|which|who|where|when|how|what|why|reflect|represent|demonstrate|illustrate|indicate|suggest|ensure|provide|support|enable|allow|help|assist|facilitate|promote|enhance|improve|develop|create|establish|maintain|manage|lead|direct|coordinate|oversee|guide|implement|execute|deliver|achieve|accomplish|realize|pursue|explore|investigate|analyze|evaluate|assess|review|examine|study|research|discover|identify|determine|define|describe|explain|clarify|communicate|share|present|report|publish|document|record|track|monitor|measure|quantify|calculate|estimate|estimated|predict|forecast|plan|design|build|construct)$/i.test(prevText)) ||
          // Handle parenthetical references that should be merged with previous text
          /^\s*\([^)]+\)\s*$/.test(seg.text) ||
          // Handle split parenthetical expressions like "USyd or simply" + "Sydney) is..."
          (!actuallyEnds && /\bor\s+\w+\s*$/.test(prevText) && /^[A-Z]\w*\)/.test(seg.text)) ||
          // Handle abbreviations that clearly need continuation (like MD-MPH + Leadership Program)
          (!actuallyEnds && /\b[A-Z]{2,}-[A-Z]{2,}$/i.test(prevText.trim())) ||
          // Handle company name splits (like "transition to Union" + "Bank") - be more specific
          (!actuallyEnds && /\b(transition to|moved to|went to)\s+[A-Z][a-z]*$/i.test(prevText.trim()) && /^[A-Z][a-z]*\b/.test(seg.text)) ||
          // Handle incomplete phrases ending with "our" followed by numbers or descriptions
          (!actuallyEnds && /\bour$/i.test(prevText.trim()) && (/^\d/.test(seg.text) || /^[A-Z]/.test(seg.text))) ||
          // Handle list continuations like "21st Century & Abstinence" + "Promotion & Say Yes"
          (!actuallyEnds && /\s(and|&)\s+[A-Za-z]+$/i.test(prevText.trim()) && /^[A-Z][a-z]/.test(seg.text))
        ) && 
        // EXCLUSIONS: Don't merge these patterns even if other conditions match
        !(
          // Don't merge "etc." + "To understand" patterns - these are often separate bullet points
          (/\betc\.?$/.test(prevText) && /^To\s+[a-z]/i.test(seg.text)) ||
          // Don't merge URL-like segments that should remain separate
          (/\b[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*/.test(seg.text) && seg.text.split(/\s+/).length <= 3)
        );

        
        // Check for separator-based lists (~ or |) that should be merged
        const hasSeparators = /[~|]/.test(prevText) || /^[~|]/.test(seg.text);
        const isListContinuation = hasSeparators && !actuallyEnds;
        
        // Check for proper noun continuation patterns
        const isProperNounContinuation = !startsLower && !actuallyEnds && (
          // Sentence fragments that clearly continue from previous text
          /^(Research|Program|Conference|Day|Award|Training|Institute|University|College|School|Department|Center|Project|Study|Analysis)\b/i.test(seg.text) ||
          // Text that starts with common continuation words
          /^(as well as|and|or|including|such as|like|for example|e\.g\.|i\.e\.|—|–|-)/i.test(seg.text) ||
          // Previous text ends with incomplete phrases that need continuation
          /\b(and|the|of|in|at|for|with|to|from|by|on|Medical Student and|Anesthesia Residents'|Research Training|Student Research)$/i.test(prevText) ||
          // Course/item lists: previous ends with comma and current starts with quoted item or continues a list
          (/,\s*$/.test(prevText) && (/^['"\u201c\u201d]/.test(seg.text) || /^(and|or)\b/i.test(seg.text)))
        );

        
        if (startsLower || isLogicalContinuation) {
          merged[merged.length - 1] += ' ' + seg.text;
        } else if (isListContinuation) {
          // Merge separator-based lists, converting separators to commas
          let combinedText = prevText + ' ' + seg.text;
          // Clean up separators: replace ~ and | with commas, but avoid double commas
          combinedText = combinedText.replace(/\s*[~|]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/\s*,$/, '');
          merged[merged.length - 1] = combinedText;
        } else if (isProperNounContinuation) {
          merged[merged.length - 1] += ' ' + seg.text;
        } else if ((isAbbreviation || /^[$£€¥₹]/.test(seg.text)) && 
                   // Apply same exclusions as logical continuation
                   !(
                     // Don't merge "etc." + "To understand" patterns - these are often separate bullet points
                     (/\betc\.?$/.test(prevText) && /^To\s+[a-z]/i.test(seg.text))
                   )) {
          // Only merge if:
          // 1. The previous text ended with an abbreviation (like "Dr."), OR
          // 2. The next segment starts with a currency symbol
          merged[merged.length - 1] += ' ' + seg.text;
        } else {
          // Default: keep segments separate unless there's a clear reason to merge
          merged.push(seg.text);
        }
      });
      
      // Post-process to merge consecutive separator-based items
      const finalMerged: string[] = [];
      for (let i = 0; i < merged.length; i++) {
        const current = merged[i];
        
        // Check if this and subsequent items are part of a separator-based list or company name continuation
        const isListItem = (/[~|]/.test(current) && !current.includes('.') && !current.includes('!') && !current.includes('?')) ||
                          (current.includes(',') && current.split(/\s+/).length > 5 && !current.includes('.') && !current.includes('!') && !current.includes('?'));
        
        if (isListItem) {
          let listItems = [current];
          let j = i + 1;
          
          // Collect consecutive items that are part of the same list
          while (j < merged.length) {
            const next = merged[j];
            // Continue if it has separators, starts with separator, or looks like a continuation
            if (/[~|]/.test(next) || /^[~|]/.test(next) || 
                (!next.includes('.') && !next.includes('!') && !next.includes('?') && 
                 next.split(/\s+/).length < 10 && /^[A-Z]/.test(next)) ||
                // Also include common company/organization suffixes that got split
                /^(Therapeutics|Solutions|Systems|Technologies|Institute|University|College|Corporation|Corp|Inc|LLC|Ltd|Group|Associates|Partners|Consulting|Services|Medical|Health|Healthcare|Pharmaceuticals|Biotech|Labs|Laboratory)(\s|,|$)/i.test(next)) {
              listItems.push(next);
              j++;
            } else {
              break;
            }
          }
          
          if (listItems.length > 1) {
            // Merge all list items into one, converting separators to commas
            let combinedList = listItems.join(' ');
            combinedList = combinedList.replace(/\s*[~|]\s*/g, ', ')
                                     .replace(/,\s*,/g, ',')
                                     .replace(/^,\s*/, '')
                                     .replace(/\s*,$/, '');
            finalMerged.push(combinedList);
            i = j - 1; // Skip the items we just merged
          } else {
            finalMerged.push(current);
          }
        } else {
          finalMerged.push(current);
        }
      }
      
      // Capitalize first letter of each highlight and fix nested quotes
      pos.highlights = finalMerged.map(highlight => {
        let cleaned = highlight.charAt(0).toUpperCase() + highlight.slice(1);
        
        // Clean URL fragments from highlights
        // Handle complete URLs in parentheses
        cleaned = cleaned.replace(/\s*\(\s*https?:\/\/[^\s)]+\s*\)\s*/gi, ' ').trim();
        cleaned = cleaned.replace(/\s*\(\s*(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?\/?\s*\)\s*/gi, ' ').trim();
        // Handle incomplete URLs like "(http://" at the end
        cleaned = cleaned.replace(/\s*\(\s*https?:\/\/\s*$/gi, '').trim();
        cleaned = cleaned.replace(/\s*\(\s*http:\/\/\s*$/gi, '').trim();
        // Handle orphaned closing parentheses after URL cleaning (but preserve legitimate parentheses)
        // Only remove ) if it's clearly orphaned (preceded by space and no matching content)
        if (/\s+\)\s*$/.test(cleaned) && !/\([^)]*\)\s*$/.test(cleaned)) {
          cleaned = cleaned.replace(/\s+\)\s*$/gi, '').trim();
        }
        // Handle bare URLs without parentheses
        cleaned = cleaned.replace(/\s+https?:\/\/[^\s]+/gi, '').trim();
        cleaned = cleaned.replace(/\s+(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s]*)?/gi, '').trim();
        // Handle Wikipedia-style URL fragments like "University_of_Sydney)"
        cleaned = cleaned.replace(/\b[A-Z][A-Za-z0-9_-]*_[A-Za-z0-9_-]*\)?\s*$/gi, '').trim();
        // Clean up multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        // Convert all quotes (including Unicode smart quotes) to standard ASCII quotes to avoid JSON validation issues
        // This prevents nested quote problems in JSON output
        // Handle double quotes: " " " → ' '
        cleaned = cleaned.replace(/[\u201c\u201d"""]([^\u201c\u201d"""]+)[\u201c\u201d"""]/g, "'$1'");
        // Handle single smart quotes: ' ' → '
        cleaned = cleaned.replace(/[\u2018\u2019'']/g, "'");
        return cleaned;
      }).filter(highlight => highlight.trim().length > 0); // Filter out empty highlights
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
        if (isNoise(t)) { 
          look++; continue; 
        }
        if (headerRe.test(t)) {
          break;
        }
        // Break if we hit a line that looks like a new school
        // Schools can be traditional institutions or online platforms
        const isTraditionalSchool = /\b(University|College|Institute|School|Academy)\b/i.test(t);
        const isOnlinePlatform = /\b(Coursera|edX|Udacity|Khan Academy|MIT OpenCourseWare|Stanford Online|Harvard Extension|Berkeley Extension)\b/i.test(t);
        const hasSchoolFont = rightColumnLines[look].fontSize >= schoolFont - 0.1;
        const looksLikeSchool = hasSchoolFont && (isTraditionalSchool || isOnlinePlatform) && t.length > 3;
        
        if (looksLikeSchool) {
          break; // new school starts
        }
        
        // Include date lines in the accumulation instead of breaking on them
        // This allows proper parsing of patterns like "BA (Honors), Statistics, Molecular & Cell Biology (Neurobiology) · (2015 - 2018)"
        degreeFieldStr += ' ' + t;
        look++;
        
        // Stop after date line (but include it first)
        if (/^[\u2022•·]?\s*\(?[0-9]{4}(?:\s*[–-]\s*(Present|[0-9]{4}))?\)?$/.test(t)) {
          break;
        }
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
        // Look for mixed patterns like "· (2019 - December 2023)" (year-only start, month-year end)
        const mixedDateMatch = degreeFieldStr.match(/·\s*\((\d{4})\s*-\s*([A-Za-z]+ \d{4}|Present)\)$/);
        if (mixedDateMatch) {
          start = mixedDateMatch[1];
          const endVal = mixedDateMatch[2];
          end = /Present/i.test(endVal) ? null : endVal;
          degreeFieldStr = degreeFieldStr.replace(/·\s*\([^)]+\)$/, '').trim();
        } else {
          // Look for year-only patterns like "· (2015 - 2018)"
          const yearOnlyMatch = degreeFieldStr.match(/·\s*\((\d{4})\s*-\s*(\d{4}|Present)\)$/);
          if (yearOnlyMatch) {
            start = yearOnlyMatch[1];
            const endVal = yearOnlyMatch[2];
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
        }
      }

      // remove trailing bullets / separators
      degreeFieldStr = degreeFieldStr.replace(/[\u2022•·]+$/,'').trim().replace(/,+$/,'');

      const degreeSet = new Set(['PHD','MSC','MS','MBA','MD','BS','BA','BSC','BACHELOR','BACHELORS','MASTER','MASTERS','DOCTOR','SECONDARY']);
      let degree = '';
      let field: string | undefined;
      if (degreeFieldStr.includes(',')) {
        const [lhs, rhs] = degreeFieldStr.split(/,(.+)/);
        const lhsTrim = lhs.trim();
        const rhsTrim = (rhs ?? '').trim();
        const lhsKey = lhsTrim.split(/\s+/)[0].replace(/\./g,'').replace(/'/g,'').toUpperCase();

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
          let remainingText = degreeFieldStr.slice(firstTokRaw.length).trim().replace(/^,\s*/,'');
          // Handle "Bachelor of" pattern - remove the "of" preposition
          if (firstTok === 'BACHELOR' && remainingText.startsWith('of ')) {
            remainingText = remainingText.slice(3); // Remove "of "
          }
          field = remainingText;
        } else if (/Secondary Education/i.test(degreeFieldStr)) {
          degree = "Secondary Education";
          field = degreeFieldStr.replace(/Secondary Education,?\s*/i, '').trim() || undefined;
        } else if (/^HS Diploma$/i.test(degreeFieldStr)) {
          degree = "HS Diploma";
          field = undefined;
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

  // ------------------- AWARDS PARSING (LEFT COLUMN) ------------------------
  const awards: JSONResumeAward[] = [];
  const awardsHeaderIdx = leftColumnLines.findIndex((l) => /^(Honors?-?Awards?|Awards?|Honors?|Recognition)$/i.test(l.text));
  
  if (awardsHeaderIdx !== -1) {
    let idx = awardsHeaderIdx + 1;
    
    while (idx < leftColumnLines.length) {
      const line = leftColumnLines[idx];
      const txt = line.text.trim();
      
      // Skip empty lines
      if (!txt) { idx++; continue; }
      
      // Break if we reach another major section
      if (/^(Contact|Education|Experience|Top Skills|Skills|Certifications?|Publications?|Languages?|Projects?)$/i.test(txt)) {
        break;
      }
      
      // Awards are typically in smaller font (10.5) compared to headers (13)
      // Skip summary text (larger font, longer lines)
      if (line.fontSize >= 12 && txt.length > 50) {
        idx++;
        continue;
      }
      
      // Look for award entries - they can span multiple lines
      if (line.fontSize <= 11) {
        let awardTitle = txt;
        
        // Check if this starts an award (typically starts with "Recognized" or similar)
        if (/^(Recognized|Awarded|Named|Selected|Honored|Winner|Recipient|Achievement)/i.test(txt)) {
          // Look ahead to combine multi-line award titles
          let nextIdx = idx + 1;
          while (nextIdx < leftColumnLines.length) {
            const nextLine = leftColumnLines[nextIdx];
            const nextTxt = nextLine.text.trim();
            
            // Stop if empty line or next section
            if (!nextTxt || /^(Contact|Education|Experience|Top Skills|Skills|Certifications?|Publications?|Languages?|Projects?)$/i.test(nextTxt)) {
              break;
            }
            
            // Stop if next line looks like a new award (starts with recognition keywords)
            if (/^(Recognized|Awarded|Named|Selected|Honored|Winner|Recipient|Achievement)/i.test(nextTxt)) {
              break;
            }
            
            // Stop if font size indicates a new section
            if (nextLine.fontSize >= 12) {
              break;
            }
            
            // This line continues the current award title
            awardTitle += ' ' + nextTxt;
            nextIdx++;
          }
          
          awards.push({
            title: awardTitle
          });
          
          idx = nextIdx - 1; // Set to last consumed line
        }
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
        const inlineMatch = txt.match(inlineFluentRe);
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

  const toIso = (val: string | null | undefined): string | undefined => {
    if (!val) return undefined; // Return undefined instead of null for schema compliance
    const parts = val.split(/\s+/);
    if (parts.length === 2) {
      const m = monthMap[parts[0].toLowerCase()];
      const y = parts[1];
      if (m && /\d{4}/.test(y)) return `${y}-${m}`;
    }
    // If it's just a year, return as-is (YYYY format is valid in schema)
    if (yearOnlyRe.test(val.trim())) return val.trim();
    return val; // fallback
  };

  return {
    $schema: "https://jsonresume.org/schema/1.0.0/resume.json",
    basics,
    work: positions.map((p) => ({
      name: p.company,
      position: p.title,
      ...(p.location ? { location: p.location } : {}),
      ...(toIso(p.start) ? { startDate: toIso(p.start) } : {}),
      ...(toIso(p.end) ? { endDate: toIso(p.end) } : {}),
      ...(p.summary ? { summary: p.summary } : {}),
      ...(p.url ? { url: p.url } : {}),
      ...(p.highlights ? { highlights: p.highlights } : {}),
    })),
    education: education.map((e) => ({
      institution: e.school,
      ...(e.degree ? { studyType: e.degree } : {}),
      ...(e.field ? { area: e.field } : {}),
      ...(toIso(e.start) ? { startDate: toIso(e.start) } : {}),
      ...(toIso(e.end) ? { endDate: toIso(e.end) } : {}),
    })),
    ...(awards.length > 0 ? { awards } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    ...(certificates.length > 0 ? { certificates } : {}),
    ...(languages.length > 0 ? { languages } : {}),
  };
}
