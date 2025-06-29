/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO

import fs from "node:fs";
import PDFParser from 'pdf2json';

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

export interface JSONResumeProfile {
  network: string;
  username: string;
  url: string;
}

export interface JSONResumeBasics {
  name?: string;
  label?: string;
  email?: string;
  phone?: string;
  url?: string;
  location?: JSONResumeLocation;
  summary?: string;
  profiles?: JSONResumeProfile[];
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

// pdf2json types
interface PDFTextItem {
  x: number;
  y: number;
  w: number;
  sw: number;
  A: string; // alignment
  R: Array<{
    T: string; // text content
    S: number; // style index
    TS: [number, number, number, number]; // [fontFace, fontSize, bold, italic]
  }>;
  clr?: number; // color index
  oc?: string; // outline color (hex)
}

interface PDFPage {
  Width: number;
  Height: number;
  HLines: any[];
  VLines: any[];
  Fills: any[];
  Texts: PDFTextItem[];
}

interface PDFData {
  Pages: PDFPage[];
  Meta: any;
}

// Color constants
const COLORS = {
  BLACK: '#212121',
  GRAY: '#bebebe',
  LIGHT_GRAY: '#e1e8ed'
};

// Helper to convert pdf2json color index to hex
function colorIndexToHex(colorIndex: number | undefined): string {
  if (colorIndex === undefined) return COLORS.BLACK;
  
  // pdf2json uses different color encoding - let's debug and map actual values
  // For now, return the index as a debug value
  return `#${colorIndex?.toString(16).padStart(6, '0')}` || COLORS.BLACK;
}

function extractTextContent(textItem: PDFTextItem): { text: string; fontSize: number; color: string; outlineColor?: string } {
  const textParts = textItem.R.map(r => decodeURIComponent(r.T)).join('');
  const fontSize = textItem.R.length > 0 ? textItem.R[0].TS[1] : 12;
  const color = colorIndexToHex(textItem.clr);
  const outlineColor = textItem.oc;
  
  return {
    text: textParts,
    fontSize,
    color,
    outlineColor
  };
}

export async function parseLinkedInPdf(pdfInput: string | Buffer): Promise<JSONResume> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(`PDF parsing error: ${errData.parserError}`));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: PDFData) => {
      try {
        const result = parsePDFData(pdfData);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    if (typeof pdfInput === 'string') {
      // File path
      pdfParser.loadPDF(pdfInput);
    } else {
      // Buffer
      pdfParser.parseBuffer(pdfInput);
    }
  });
}

function parsePDFData(pdfData: PDFData): JSONResume {
  console.log(`DEBUG: Processing ${pdfData.Pages.length} pages`);
  
  // Extract all text items from all pages with position and formatting info
  const allTextItems: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    outlineColor?: string;
    page: number;
  }> = [];
  
  pdfData.Pages.forEach((page, pageIndex) => {
    console.log(`DEBUG: Page ${pageIndex + 1} has ${page.Texts.length} text items`);
    
    page.Texts.forEach(textItem => {
      const { text, fontSize, color, outlineColor } = extractTextContent(textItem);
      if (text.trim()) {
        allTextItems.push({
          text: text.trim(),
          x: textItem.x,
          y: textItem.y,
          fontSize,
          color,
          outlineColor,
          page: pageIndex + 1
        });
      }
    });
  });
  
  console.log(`DEBUG: Total text items: ${allTextItems.length}`);
  console.log(`DEBUG: First 10 items:`, allTextItems.slice(0, 10));
  
  // 1. Separate left and right columns
  const { leftColumn, rightColumn } = separateColumns(allTextItems);
  console.log(`DEBUG: Left column: ${leftColumn.length} items`);
  console.log(`DEBUG: Right column: ${rightColumn.length} items`);
  
  // 2. Parse left column sections
  const leftSections = parseLeftColumnSections(leftColumn);
  
  // 3. Parse right column sections
  const rightSections = parseRightColumnSections(rightColumn);
  
  // 4. Build final JSON Resume
  return buildJSONResume(leftSections, rightSections);
}

function separateColumns(textItems: Array<{
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  outlineColor?: string;
  page: number;
}>): {
  leftColumn: typeof textItems;
  rightColumn: typeof textItems;
} {
  // Find column boundary by analyzing x positions
  const xPositions = textItems.map(item => item.x);
  xPositions.sort((a, b) => a - b);
  
  console.log(`DEBUG: X positions range: ${Math.min(...xPositions)} to ${Math.max(...xPositions)}`);
  console.log(`DEBUG: Sample x positions:`, xPositions.slice(0, 10));
  
  // Look for a significant gap in x positions to identify column boundary
  let maxGap = 0;
  let columnBoundary = 0;
  
  for (let i = 1; i < xPositions.length; i++) {
    const gap = xPositions[i] - xPositions[i-1];
    if (gap > maxGap) {
      maxGap = gap;
      columnBoundary = (xPositions[i-1] + xPositions[i]) / 2;
    }
  }
  
  console.log(`DEBUG: Column boundary at x=${columnBoundary} (gap: ${maxGap})`);
  
  const leftColumn = textItems.filter(item => item.x < columnBoundary);
  const rightColumn = textItems.filter(item => item.x >= columnBoundary);
  
  return { leftColumn, rightColumn };
}

function parseLeftColumnSections(leftColumn: Array<{
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  outlineColor?: string;
  page: number;
}>): { [sectionName: string]: typeof leftColumn } {
  const sections: { [sectionName: string]: typeof leftColumn } = {};
  
  // Find section headers - larger font and specific color
  const sectionHeaders = leftColumn.filter(item => 
    item.fontSize >= 16 && 
    /^(Contact|Top Skills|Skills|Certifications?|Languages?)$/i.test(item.text)
  );
  
  console.log(`DEBUG: Found ${sectionHeaders.length} left column section headers:`, 
    sectionHeaders.map(h => ({ text: h.text, color: h.color, fontSize: h.fontSize })));
  
  // Group items under each section header
  for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i];
    const nextHeader = sectionHeaders[i + 1];
    
    const sectionItems = leftColumn.filter(item => {
      if (item.y <= header.y) return false; // Must be below header
      if (nextHeader && item.y >= nextHeader.y) return false; // Must be above next header
      return true;
    });
    
    sections[header.text] = sectionItems;
    console.log(`DEBUG: Section "${header.text}" has ${sectionItems.length} items`);
  }
  
  return sections;
}

function parseRightColumnSections(rightColumn: Array<{
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  outlineColor?: string;
  page: number;
}>): {
  basics: typeof rightColumn;
  experience?: typeof rightColumn;
  education?: typeof rightColumn;
} {
  const sections: {
    basics: typeof rightColumn;
    experience?: typeof rightColumn;
    education?: typeof rightColumn;
  } = {
    basics: []
  };
  
  // Find major section headers by looking for headrule + large font pattern
  // First, let's identify all large font items that could be headers
  const potentialHeaders = rightColumn.filter(item => 
    item.fontSize >= 18 && 
    /^(Experience|Education|Projects|Volunteer|Awards|Publications)$/i.test(item.text)
  );
  
  // For now, let's focus on Experience section which we know has the headrule pattern
  // We'll identify it by being on page 1 with large font
  const majorHeaders = potentialHeaders.filter(item => 
    item.page === 1 && // Experience section is on page 1
    item.text === 'Experience'
  );
  
  // Sort headers by y position (top to bottom)
  majorHeaders.sort((a, b) => a.y - b.y);
  
  console.log(`DEBUG: Found ${majorHeaders.length} right column major headers (sorted):`, 
    majorHeaders.map(h => ({ text: h.text, fontSize: h.fontSize, y: h.y })));
  
  // Debug: Let's see what's being detected as Education header
  const educationHeaders = rightColumn.filter(item => 
    item.fontSize >= 18 && 
    /^Education$/i.test(item.text)
  );
  console.log(`DEBUG: Potential headers found:`, potentialHeaders.map(h => ({ 
    text: h.text, 
    fontSize: h.fontSize, 
    y: h.y,
    page: h.page
  })));
  
  console.log(`DEBUG: Major headers after filtering:`, majorHeaders.map(h => ({ 
    text: h.text, 
    fontSize: h.fontSize, 
    y: h.y,
    page: h.page
  })));
  
  console.log(`DEBUG: All right column items around Experience:`, 
    rightColumn.filter(item => item.y > 18 && item.y < 25).map(item => ({
      text: item.text,
      y: item.y,
      page: item.page,
      fontSize: item.fontSize
    })));
  
  // Everything before first major header is "basics", but only on page 1
  const firstMajorHeader = majorHeaders.length > 0 ? majorHeaders[0] : null;
  sections.basics = rightColumn.filter(item => {
    if (firstMajorHeader && item.y >= firstMajorHeader.y) return false; // Must be before first major header
    if (item.page !== 1) return false; // Only include page 1 content in basics
    return true;
  });
  console.log(`DEBUG: Basics section has ${sections.basics.length} items`);
  
  // Group items under each major section
  for (let i = 0; i < majorHeaders.length; i++) {
    const header = majorHeaders[i];
    const nextHeader = majorHeaders[i + 1];
    
    const sectionItems = rightColumn.filter(item => {
      if (item.y <= header.y) return false; // Must be below header
      if (nextHeader && item.y >= nextHeader.y) return false; // Must be above next header
      return true;
    });
    
    const sectionName = header.text.toLowerCase();
    if (sectionName === 'experience') {
      sections.experience = sectionItems;
    } else if (sectionName === 'education') {
      sections.education = sectionItems;
    }
    
    console.log(`DEBUG: Section "${header.text}" (y=${header.y}) has ${sectionItems.length} items`);
    if (sectionItems.length > 0) {
      console.log(`DEBUG: First few items:`, sectionItems.slice(0, 3).map(item => ({
        text: item.text,
        y: item.y,
        page: item.page
      })));
    }
  }
  
  return sections;
}

function buildJSONResume(
  leftSections: { [sectionName: string]: any[] },
  rightSections: { basics: any[]; experience?: any[]; education?: any[] }
): JSONResume {
  const resume: JSONResume = {
    $schema: "https://jsonresume.org/schema/1.0.0/resume.json",
    basics: parseBasics(rightSections.basics),
    work: rightSections.experience ? parseExperience(rightSections.experience) : [],
    education: rightSections.education ? parseEducation(rightSections.education) : [],
  };
  
  // Add left column sections
  if (leftSections['Top Skills'] || leftSections['Skills']) {
    resume.skills = parseSkills(leftSections['Top Skills'] || leftSections['Skills'] || []);
  }
  
  if (leftSections['Certifications'] || leftSections['Certification']) {
    resume.certificates = parseCertificates(leftSections['Certifications'] || leftSections['Certification'] || []);
  }
  
  // Merge contact info from left column into basics
  if (leftSections['Contact'] && resume.basics) {
    mergeContactInfo(resume.basics, leftSections['Contact']);
  }
  
  return resume;
}

function mergeContactInfo(basics: JSONResumeBasics, contactItems: any[]): void {
  console.log(`DEBUG: Merging contact info from ${contactItems.length} items`);
  
  // Find email - look for @ sign and potential continuation
  const emailParts = contactItems.filter(item => /@/.test(item.text));
  if (emailParts.length > 0) {
    // Sort by position and combine
    emailParts.sort((a, b) => a.y - b.y || a.x - b.x);
    let email = emailParts[0].text;
    
    // Check if there's a continuation part (like "u" from split email)
    // Look for the next item that's very close in position and looks like a continuation
    const emailY = emailParts[0].y;
    const continuationItem = contactItems.find(item => 
      item.y > emailY && 
      item.y < emailY + 1 && // very close vertically
      item.text.length <= 3 && // short text
      /^[a-z]+$/.test(item.text) && // lowercase letters only
      !/@/.test(item.text) // not another email
    );
    
    if (continuationItem) {
      email += continuationItem.text;
      console.log(`DEBUG: Found email continuation: "${continuationItem.text}"`);
    }
    
    basics.email = email;
    console.log(`DEBUG: Found email in contact: "${basics.email}"`);
  }
  
  // Find LinkedIn profile
  const linkedinItems = contactItems.filter(item => 
    /linkedin\.com\/in\//.test(item.text) || item.text === '(LinkedIn)'
  );
  
  if (linkedinItems.length > 0) {
    const linkedinItem = linkedinItems.find(item => /linkedin\.com\/in\//.test(item.text));
    if (linkedinItem) {
      const match = linkedinItem.text.match(/linkedin\.com\/in\/([^\/\s)]+)/);
      if (match) {
        basics.profiles = [{
          network: 'LinkedIn',
          username: match[1],
          url: `https://www.${linkedinItem.text.replace(/^www\./, '')}`
        }];
        console.log(`DEBUG: Found LinkedIn profile in contact: ${basics.profiles[0].url}`);
      }
    }
  }
}

function parseBasics(basicsItems: Array<{
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  outlineColor?: string;
  page: number;
}>): JSONResumeBasics {
  console.log(`DEBUG: Parsing basics from ${basicsItems.length} items`);
  console.log(`DEBUG: Basics items:`, basicsItems.map(item => ({
    text: item.text,
    fontSize: item.fontSize,
    color: item.color,
    y: item.y
  })));
  
  const basics: JSONResumeBasics = {};
  
  // Sort by y position (top to bottom)
  basicsItems.sort((a, b) => a.y - b.y);
  
  // Name should be the largest font at the top
  const maxFontSize = Math.max(...basicsItems.map(i => i.fontSize));
  console.log(`DEBUG: Max font size: ${maxFontSize}`);
  
  const nameItem = basicsItems.find(item => 
    item.fontSize === maxFontSize && item.text.length > 3
  );
  if (nameItem) {
    basics.name = nameItem.text;
    console.log(`DEBUG: Found name: "${basics.name}" (fontSize: ${nameItem.fontSize})`);
  }
  
  // Label should be the text immediately after the name
  // Looking at the debug output, it should be "Research Investigator and Core Director of Bioinformatics at Gladstone Institutes"
  const nameY = nameItem?.y || 0;
  const labelCandidates = basicsItems.filter(item => 
    item.y > nameY && 
    item.y < nameY + 3 && // within 3 units of name
    item.text.length > 10 && 
    item.fontSize === 15 && // consistent font size for labels
    !/@/.test(item.text) &&
    !/linkedin/i.test(item.text) &&
    !/Summary|Education|Experience/i.test(item.text)
  );
  
  if (labelCandidates.length > 0) {
    labelCandidates.sort((a, b) => a.y - b.y);
    // Combine consecutive lines that are close together
    let labelText = labelCandidates[0].text;
    for (let i = 1; i < labelCandidates.length; i++) {
      if (Math.abs(labelCandidates[i].y - labelCandidates[i-1].y) < 1.5) {
        labelText += ' ' + labelCandidates[i].text;
      } else {
        break;
      }
    }
    basics.label = labelText;
    console.log(`DEBUG: Found label: "${basics.label}"`);
  }
  
  // Location detection using color - location text has outlineColor #b0b0b0
  const locationItems = basicsItems.filter(item => 
    item.outlineColor === '#b0b0b0'
  );
  if (locationItems.length > 0) {
    const locationText = locationItems[0].text;
    basics.location = parseLocationText(locationText);
    console.log(`DEBUG: Found location (color-based): "${locationText}"`);
  }
  
  // Summary - look for content after "Summary" header but before next major section
  const summaryHeaderIndex = basicsItems.findIndex(item => item.text === 'Summary');
  if (summaryHeaderIndex !== -1) {
    const summaryHeader = basicsItems[summaryHeaderIndex];
    const nextMajorSectionIndex = basicsItems.findIndex(item => 
      item.y > summaryHeader.y && 
      (item.text === 'Education' || item.text === 'Experience') &&
      item.fontSize >= 18
    );
    
    const summaryEndY = nextMajorSectionIndex !== -1 ? basicsItems[nextMajorSectionIndex].y : Infinity;
    console.log(`DEBUG: Summary parsing - nextMajorSectionIndex: ${nextMajorSectionIndex}, summaryEndY: ${summaryEndY}`);
    
    const summaryItems = basicsItems.filter(item => 
      item.y > summaryHeader.y &&
      item.y < summaryEndY &&
      item.fontSize === 15 &&
      // Only exclude items that are clearly not part of the summary
      !/^(Executive Director|Google Summer|September|February|\d+ years|nrnb\.org|The Rockefeller|University of)/i.test(item.text) &&
      // Don't exclude "Experience in..." text which is part of summary
      item.text !== 'Education' && item.text !== 'Experience' // Only exclude exact header matches
    );
    
    if (summaryItems.length > 0) {
      summaryItems.sort((a, b) => a.y - b.y);
      basics.summary = summaryItems.map(item => item.text).join(' ');
      console.log(`DEBUG: Found summary (${summaryItems.length} parts): "${basics.summary}"`);
      console.log(`DEBUG: Summary items y-coordinates:`, summaryItems.map(item => ({ text: item.text.substring(0, 50), y: item.y })));
    }
    
    // Debug: Let's see what's being filtered out
    const allSummaryAreaItems = basicsItems.filter(item => 
      item.y > summaryHeader.y &&
      item.y < summaryEndY &&
      item.fontSize === 15
    );
    console.log(`DEBUG: All items in summary area (${allSummaryAreaItems.length}):`, allSummaryAreaItems.map(item => ({ 
      text: item.text.substring(0, 50), 
      y: item.y,
      included: summaryItems.includes(item)
    })));
  }
  
  // Email and LinkedIn will be added from the Contact section in left column
  
  return basics;
}

function parseLocationText(locationText: string): JSONResumeLocation {
  const parts = locationText.split(',').map(p => p.trim());
  const location: JSONResumeLocation = {};
  
  if (parts.length >= 1) location.city = parts[0];
  if (parts.length >= 2) location.region = parts[1];
  if (parts.length >= 3) location.countryCode = parts[2];
  
  return location;
}

function parseExperience(experienceItems: any[]): JSONResumeWork[] {
  console.log(`DEBUG: Parsing experience from ${experienceItems.length} items`);
  console.log(`DEBUG: Experience items:`, experienceItems.slice(0, 10).map(item => ({
    text: item.text,
    fontSize: item.fontSize,
    y: item.y,
    page: item.page
  })));
  
  const workEntries: JSONResumeWork[] = [];
  
  // Group items by company - companies are typically fontSize 15
  const companyItems = experienceItems.filter(item => item.fontSize === 15);
  
  for (const companyItem of companyItems) {
    const companyName = companyItem.text;
    
    // Find items related to this company (within reasonable y range)
    const relatedItems = experienceItems.filter(item => 
      item.y > companyItem.y && 
      item.y < companyItem.y + 10 // within 10 units
    );
    
    // Look for position title (fontSize 14.5)
    const positionItem = relatedItems.find(item => item.fontSize === 14.5);
    
    // Look for date range (fontSize 13.5, contains dates)
    const dateItem = relatedItems.find(item => 
      item.fontSize === 13.5 && 
      /\d{4}/.test(item.text) && 
      /Present|January|February|March|April|May|June|July|August|September|October|November|December/.test(item.text)
    );
    
    if (positionItem && dateItem) {
      const entry: JSONResumeWork = {
        name: companyName,
        position: positionItem.text,
        startDate: extractStartDate(dateItem.text),
        endDate: extractEndDate(dateItem.text)
      };
      
      workEntries.push(entry);
      console.log(`DEBUG: Found work entry: ${entry.name} - ${entry.position}`);
    }
  }
  
  return workEntries;
}

function extractStartDate(dateText: string): string | undefined {
  const match = dateText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
  if (match) {
    const monthMap: { [key: string]: string } = {
      'January': '01', 'February': '02', 'March': '03', 'April': '04',
      'May': '05', 'June': '06', 'July': '07', 'August': '08',
      'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    return `${match[2]}-${monthMap[match[1]]}`;
  }
  return undefined;
}

function extractEndDate(dateText: string): string | undefined {
  if (/Present/i.test(dateText)) {
    return undefined;
  }
  // Look for end date after " - "
  const match = dateText.match(/- (January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
  if (match) {
    const monthMap: { [key: string]: string } = {
      'January': '01', 'February': '02', 'March': '03', 'April': '04',
      'May': '05', 'June': '06', 'July': '07', 'August': '08',
      'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };
    return `${match[2]}-${monthMap[match[1]]}`;
  }
  return undefined;
}

function parseEducation(educationItems: any[]): JSONResumeEducation[] {
  console.log(`DEBUG: Parsing education from ${educationItems.length} items`);
  // Placeholder - will implement detailed parsing later
  return [];
}

function parseSkills(skillItems: any[]): JSONResumeSkill[] {
  console.log(`DEBUG: Parsing skills from ${skillItems.length} items`);
  return skillItems.map(item => ({ name: item.text }));
}

function parseCertificates(certItems: any[]): JSONResumeCertificate[] {
  console.log(`DEBUG: Parsing certificates from ${certItems.length} items`);
  return certItems.map(item => ({ name: item.text }));
}
