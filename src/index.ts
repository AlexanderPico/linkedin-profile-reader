/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO

import fs from "node:fs";
import PDFParser from 'pdf2json';

// Performance Metrics Interface for direct data collection
export interface ParsingMetrics {
  // Document analysis
  totalTextItems: number;
  totalPages: number;
  pageBreaksRemoved: number;
  sectionsDetected: number;
  
  // Basics metrics
  hasName: boolean;
  hasLabel: boolean;
  hasLocation: boolean;
  hasEmail: boolean;
  hasLinkedIn: boolean;
  summaryLength: number;
  
  // Work metrics
  workEntriesDetected: number;
  workEntriesParsed: number;
  
  // Education metrics
  educationEntriesDetected: number;
  educationEntriesParsed: number;
  
  // Additional sections
  skillsCount: number;
  languagesCount: number;
  publicationsCount: number;
  awardsCount: number;
  certificatesCount: number;
  
  // Section item counts
  leftColumnSections: { [sectionName: string]: number };
  rightColumnSections: { [sectionName: string]: number };
}

// Global metrics collection during parsing
let currentMetrics: ParsingMetrics | null = null;

// Function to initialize metrics collection
function initializeMetrics(): void {
  currentMetrics = {
    totalTextItems: 0,
    totalPages: 0,
    pageBreaksRemoved: 0,
    sectionsDetected: 0,
    hasName: false,
    hasLabel: false,
    hasLocation: false,
    hasEmail: false,
    hasLinkedIn: false,
    summaryLength: 0,
    workEntriesDetected: 0,
    workEntriesParsed: 0,
    educationEntriesDetected: 0,
    educationEntriesParsed: 0,
    skillsCount: 0,
    languagesCount: 0,
    publicationsCount: 0,
    awardsCount: 0,
    certificatesCount: 0,
    leftColumnSections: {},
    rightColumnSections: {}
  };
}

// Function to get collected metrics
export function getParsingMetrics(): ParsingMetrics | null {
  return currentMetrics;
}

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

export interface JSONResumeAward {
  title: string;
  date?: string;
  awarder?: string;
  summary?: string;
}

export interface JSONResumeProject {
  name: string;
  description?: string;
  highlights?: string[];
  keywords?: string[];
  startDate?: string;
  endDate?: string;
  url?: string;
  roles?: string[];
  entity?: string;
  type?: string;
}

export interface JSONResumePublication {
  name: string;
  publisher?: string;
  releaseDate?: string;
  url?: string;
  summary?: string;
}

export interface JSONResumeVolunteer {
  organization: string;
  position?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
}

// PDF2JSON Color Range Definitions - future-proof color detection
export const PDF_COLOR_RANGES = {
  // Section headers: Light gray-blue range (HSL: ~200°, 25-30%, 88-93%)
  // Examples: #e1e8ed, #e0e9ed
  SECTION_HEADERS: {
    lightness: { min: 0.88, max: 0.93 },
    saturation: { min: 0.20, max: 0.35 },
    hue: { min: 190, max: 210 }
  },
  
  // Parenthetical labels: Medium gray-blue range (HSL: ~205°, 5-12%, 65-72%)  
  // Examples: #a8b0b5, #a9b0b6
  PARENTHETICAL_LABELS: {
    lightness: { min: 0.65, max: 0.72 },
    saturation: { min: 0.05, max: 0.15 },
    hue: { min: 195, max: 215 }
  },
  
  // Location text: Pure gray range (HSL: any°, 0-5%, 65-72%)
  // Examples: #b0b0b0, #bebebe
  LOCATION_TEXT: {
    lightness: { min: 0.65, max: 0.75 },
    saturation: { min: 0.0, max: 0.05 },
    hue: { min: 0, max: 360 } // Any hue for pure grays
  },
  
  // Main content: Very dark range (HSL: any°, 0-10%, 5-15%)
  // Examples: #181818, #212121
  MAIN_CONTENT: {
    lightness: { min: 0.05, max: 0.15 },
    saturation: { min: 0.0, max: 0.10 },
    hue: { min: 0, max: 360 }
  }
} as const;

// Convert hex color to HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return null;
  
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100) / 100,
    l: Math.round(l * 100) / 100
  };
}

// Check if color falls within a range
function isColorInRange(
  color: string | undefined, 
  range: { lightness: { min: number; max: number }; saturation: { min: number; max: number }; hue: { min: number; max: number } }
): boolean {
  if (!color) return false;
  
  const hsl = hexToHsl(color);
  if (!hsl) return false;
  
  const { h, s, l } = hsl;
  
  return (
    l >= range.lightness.min && l <= range.lightness.max &&
    s >= range.saturation.min && s <= range.saturation.max &&
    (range.hue.min === 0 && range.hue.max === 360 || // Any hue
     h >= range.hue.min && h <= range.hue.max)
  );
}

// Legacy exact color matches for fallback (can be removed once range detection is proven)
const LEGACY_COLORS = {
  SECTION_HEADERS: ['#e1e8ed', '#e0e9ed'],
  PARENTHETICAL_LABELS: ['#a8b0b5', '#a9b0b6'],
  LOCATION_TEXT: ['#b0b0b0', '#bebebe'],
  CONTACT_DETAILS: [undefined, '#000001']
} as const;

// Helper function for color checking with range-based detection
function hasOutlineColor(item: { outlineColor?: string }, colorType: keyof typeof PDF_COLOR_RANGES): boolean {
  const color = item.outlineColor;
  
  // Special handling for undefined colors (contact details)
  if (color === undefined) {
    return false; // undefined handled separately in contact parsing
  }
  
  // Range-based detection
  const range = PDF_COLOR_RANGES[colorType];
  if (isColorInRange(color, range)) {
    return true;
  }
  
  // Fallback to exact matches for safety (excluding contact details)
  if (colorType === 'SECTION_HEADERS') {
    return LEGACY_COLORS.SECTION_HEADERS.includes(color as any);
  } else if (colorType === 'PARENTHETICAL_LABELS') {
    return LEGACY_COLORS.PARENTHETICAL_LABELS.includes(color as any);
  } else if (colorType === 'LOCATION_TEXT') {
    return LEGACY_COLORS.LOCATION_TEXT.includes(color as any);
  }
  
  return false;
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
  awards?: JSONResumeAward[];
  projects?: JSONResumeProject[];
  publications?: JSONResumePublication[];
  volunteer?: JSONResumeVolunteer[];
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
        // Initialize metrics collection
        initializeMetrics();
        
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

function normalizePageBreaks(textItems: Array<{
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  outlineColor?: string;
  page: number;
}>): typeof textItems {
  console.log(`DEBUG: Starting page break normalization for ${textItems.length} items`);
  
  // Find page break lines (e.g., "Page 1 of 2", "Page 2 of 2", or individual components)
  // First, find potential page footer areas (small font, bottom of page)
  const maxY = Math.max(...textItems.map(t => t.y));
  const potentialPageFooterItems = textItems.filter(item => 
    item.fontSize <= 12 && 
    item.y > maxY - 3 // Within 3 units of bottom
  );
  
  // Look for page number patterns in footer areas
  const pageBreakLines = textItems.filter(item => 
    /^Page\s+\d+\s+of\s+\d+$/i.test(item.text.trim()) || // Full page break text
    (potentialPageFooterItems.includes(item) && 
     (item.text === 'Page' || item.text === 'of' || /^\d+$/.test(item.text))) // Page footer components
  );
  
  console.log(`DEBUG: Found ${pageBreakLines.length} page break lines:`, 
    pageBreakLines.map(pb => ({ text: pb.text, y: pb.y, page: pb.page })));
  
  if (pageBreakLines.length === 0) {
    console.log(`DEBUG: No page breaks found, returning original items`);
    return textItems;
  }
  
  // Calculate page height offsets for normalization
  // Strategy: Find the maximum y-value on each page and use it to calculate offset
  const pageMaxY: { [page: number]: number } = {};
  const pageMinY: { [page: number]: number } = {};
  
  textItems.forEach(item => {
    if (!pageMaxY[item.page] || item.y > pageMaxY[item.page]) {
      pageMaxY[item.page] = item.y;
    }
    if (!pageMinY[item.page] || item.y < pageMinY[item.page]) {
      pageMinY[item.page] = item.y;
    }
  });
  
  console.log(`DEBUG: Page Y ranges:`, Object.keys(pageMaxY).map(page => ({
    page: parseInt(page),
    minY: pageMinY[parseInt(page)],
    maxY: pageMaxY[parseInt(page)],
    height: pageMaxY[parseInt(page)] - pageMinY[parseInt(page)]
  })));
  
  // Calculate cumulative offsets for each page
  const pageOffsets: { [page: number]: number } = { 1: 0 };
  let cumulativeOffset = 0;
  
  for (let page = 2; page <= Math.max(...Object.keys(pageMaxY).map(p => parseInt(p))); page++) {
    // Add the height of the previous page
    const prevPage = page - 1;
    const prevPageHeight = pageMaxY[prevPage] - pageMinY[prevPage];
    cumulativeOffset += prevPageHeight;
    pageOffsets[page] = cumulativeOffset;
  }
  
  console.log(`DEBUG: Page offsets for normalization:`, pageOffsets);
  
  // Apply normalization: remove page break lines and adjust y-values
  const normalizedItems = textItems
    .filter(item => !pageBreakLines.some(pb => pb === item)) // Remove page break lines
    .map(item => ({
      ...item,
      y: item.y + (pageOffsets[item.page] || 0), // Adjust y-value based on page offset
      originalPage: item.page, // Keep track of original page
      page: 1 // All items are now on "page 1" in the normalized coordinate system
    }));
  
  console.log(`DEBUG: Normalized ${textItems.length} items to ${normalizedItems.length} items (removed ${pageBreakLines.length} page breaks)`);
  console.log(`DEBUG: Y-value range after normalization: ${Math.min(...normalizedItems.map(i => i.y))} to ${Math.max(...normalizedItems.map(i => i.y))}`);
  
  // Collect metrics: page breaks removed
  if (currentMetrics) {
    currentMetrics.pageBreaksRemoved = pageBreakLines.length;
  }
  
  return normalizedItems;
}

function debugRightColumnContent(rightColumn: Array<{
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  outlineColor?: string;
  page: number;
  originalPage?: number;
}>): void {
  console.log(`\n=== RIGHT COLUMN CONTENT DEBUG ===`);
  console.log(`Total items: ${rightColumn.length}`);
  
  // Sort by y position for easier reading
  const sortedItems = [...rightColumn].sort((a, b) => a.y - b.y);
  
  console.log(`\nRight column items (sorted by y-position):`);
  sortedItems.forEach((item, index) => {
    const originalPageInfo = item.originalPage ? ` (orig: page ${item.originalPage})` : '';
    const indexStr = (index + 1).toString().padStart(3);
    const yStr = item.y.toFixed(3).padStart(8);
    const fontSizeStr = item.fontSize.toString().padStart(4);
    console.log(`${indexStr}. y=${yStr} | fontSize=${fontSizeStr} | "${item.text}"${originalPageInfo}`);
  });
  
  // Analyze y-value gaps to identify potential section boundaries
  console.log(`\nY-value gap analysis:`);
  for (let i = 1; i < sortedItems.length; i++) {
    const gap = sortedItems[i].y - sortedItems[i-1].y;
    if (gap > 2.0) { // Significant gap
      console.log(`  Large gap (${gap.toFixed(3)}) between "${sortedItems[i-1].text}" and "${sortedItems[i].text}"`);
    }
  }
  console.log(`=== END RIGHT COLUMN DEBUG ===\n`);
}

function normalizeAllContent(
  textItems: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    outlineColor?: string;
    page: number;
  }>,
  headrules: Array<{
    x: number;
    y: number;
    w: number;
    l: number;
    page: number;
  }>
): {
  normalizedTextItems: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    outlineColor?: string;
    page: number;
    originalPage?: number;
  }>;
  normalizedHeadrules: Array<{
    x: number;
    y: number;
    w: number;
    l: number;
    page: number;
    originalPage: number;
    normalizedY: number;
  }>;
  pageOffsets: { [page: string]: number };
} {
  console.log(`DEBUG: Starting page break normalization for ${textItems.length} text items and ${headrules.length} headrules`);
  
  // First, normalize text items (reuse existing logic)
  const normalizedTextItems = normalizePageBreaks(textItems);
  
  // Calculate page offsets from the normalized text items
  const pageOffsets: { [page: string]: number } = { '1': 0 };
  
  // Find page breaks and calculate offsets
  const pageBreaks = textItems.filter(item => 
    item.fontSize <= 14 &&
    item.y > 45 &&
    ['Page', 'of'].includes(item.text)
  );
  
  if (pageBreaks.length > 0) {
    // Group by page and calculate height
    const pageRanges: Array<{ page: number; minY: number; maxY: number; height: number }> = [];
    const pages = [...new Set(textItems.map(item => item.page))].sort();
    
    pages.forEach(page => {
      const pageItems = textItems.filter(item => item.page === page);
      if (pageItems.length > 0) {
        const minY = Math.min(...pageItems.map(item => item.y));
        const maxY = Math.max(...pageItems.map(item => item.y));
        pageRanges.push({ page, minY, maxY, height: maxY - minY });
      }
    });
    
    console.log('DEBUG: Page Y ranges:', pageRanges);
    
    // Calculate cumulative offsets
    let cumulativeOffset = 0;
    pages.forEach(page => {
      pageOffsets[page.toString()] = cumulativeOffset;
      if (page < pages.length) {
        cumulativeOffset += 45.235; // Fixed offset
      }
    });
    
    console.log('DEBUG: Page offsets for normalization:', pageOffsets);
  }
  
  // Now normalize headrules using the same page offsets
  const normalizedHeadrules = headrules.map(headrule => {
    const pageOffset = pageOffsets[headrule.page.toString()] || 0;
    return {
      ...headrule,
      originalPage: headrule.page,
      normalizedY: headrule.y + pageOffset
    };
  });
  
  return { normalizedTextItems, normalizedHeadrules, pageOffsets };
}

function parsePDFData(pdfData: PDFData): JSONResume {
  // STEP 1: Extract all text content from all pages
  const allTextItems: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    outlineColor?: string;
    page: number;
  }> = [];

  pdfData.Pages.forEach((page: PDFPage, pageIndex: number) => {
    page.Texts.forEach((textItem: PDFTextItem) => {
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

  // STEP 1b: Extract all headrules (HLines) from all pages
  const allHeadrules: Array<{
    x: number;
    y: number;
    w: number;
    l: number;
    page: number;
  }> = [];

  pdfData.Pages.forEach((page: any, pageIndex: number) => {
    if (page.HLines) {
      page.HLines.forEach((line: any) => {
        allHeadrules.push({
          x: line.x,
          y: line.y,
          w: line.w,
          l: line.l,
          page: pageIndex + 1
        });
      });
    }
  });
  
  // Collect metrics: document analysis
  if (currentMetrics) {
    currentMetrics.totalTextItems = allTextItems.length;
    currentMetrics.totalPages = pdfData.Pages.length;
  }
  
  console.log(`DEBUG: Total text items: ${allTextItems.length}`);
  console.log(`DEBUG: Total headrules: ${allHeadrules.length}`);
  console.log(`DEBUG: First 10 items:`, allTextItems.slice(0, 10));
  
  // STEP 2: Normalize page breaks for ALL content (text + headrules)
  const { normalizedTextItems, normalizedHeadrules, pageOffsets } = normalizeAllContent(allTextItems, allHeadrules);
  
  // STEP 3: Separate left and right columns (now with normalized coordinates)
  const { leftColumn, rightColumn } = separateColumns(normalizedTextItems);
  console.log(`DEBUG: Left column: ${leftColumn.length} items`);
  console.log(`DEBUG: Right column: ${rightColumn.length} items`);
  
  // Filter headrules to right column only (x > column boundary)
  const rightColumnHeadrules = normalizedHeadrules.filter(h => h.x > 10); // Use same threshold as before
  console.log(`DEBUG: Right column headrules: ${rightColumnHeadrules.length}`);
  
  // Debug: Print right column content for analysis
  debugRightColumnContent(rightColumn);
  
  // STEP 4: Parse left column sections
  const leftSections = parseLeftColumnSections(leftColumn);
  
  // STEP 5: Parse right column sections using normalized headrules + titles strategy
  const rightSections = parseRightColumnSections(rightColumn, rightColumnHeadrules);
  
  // STEP 6: Build final JSON Resume
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
  originalPage?: number;
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
  originalPage?: number;
}>): { [sectionName: string]: typeof leftColumn } {
  const sections: { [sectionName: string]: typeof leftColumn } = {};
  
  // Find ALL section headers based on visual properties (font size + color)
  const allHeaders = leftColumn.filter(item => 
    item.fontSize >= 16 && 
    hasOutlineColor(item, 'SECTION_HEADERS')
  );
  
  console.log(`DEBUG: Found ${allHeaders.length} left column headers (visual detection):`, 
    allHeaders.map(h => ({ 
      text: h.text, 
      fontSize: h.fontSize, 
      outlineColor: h.outlineColor,
      y: h.y 
    })));
  
  // Hardcoded mapping from detected header text to JSON Resume schema sections
  const headerToSchemaMap: { [key: string]: string } = {
    'Contact': 'Contact',
    'Top Skills': 'Skills',
    'Certifications': 'Certifications',
    'Languages': 'Languages',
    'Honors-Awards': 'Awards',
    'Projects': 'Projects',
    'Publications': 'Publications'
  };
  
  // Map detected headers to schema sections
  const sectionHeaders = allHeaders.map(header => ({
    ...header,
    schemaSection: headerToSchemaMap[header.text] || header.text // fallback to original text
  }));
  
  console.log(`DEBUG: Mapped headers to schema sections:`, 
    sectionHeaders.map(h => ({ 
      originalText: h.text, 
      schemaSection: h.schemaSection,
      y: h.y 
    })));
  
  // Group items under each section header
  for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i];
    const nextHeader = sectionHeaders[i + 1];
    
    const sectionItems = leftColumn.filter(item => {
      if (item.y <= header.y) return false; // Must be below header
      if (nextHeader && item.y >= nextHeader.y) return false; // Must be above next header
      return true;
    });
    
    // Use the schema section name as the key
    sections[header.schemaSection] = sectionItems;
    console.log(`DEBUG: Section "${header.schemaSection}" (original: "${header.text}") has ${sectionItems.length} items`);
    
    // Collect metrics: left column sections
    if (currentMetrics) {
      currentMetrics.leftColumnSections[header.schemaSection] = sectionItems.length;
    }
  }
  
  return sections;
}

function mapToSchemaSection(text: string): string | null {
  const headerToSchemaMap: { [key: string]: string } = {
    'Experience': 'Experience',
    'Education': 'Education',
    'Projects': 'Projects',
    'Summary': 'Summary'
  };
  
  return headerToSchemaMap[text] || null;
}

function parseRightColumnSections(
  rightColumn: Array<{
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    outlineColor?: string;
    page: number;
    originalPage?: number;
  }>, 
  rightColumnHeadrules: Array<{
    x: number;
    y: number;
    w: number;
    l: number;
    page: number;
    originalPage: number;
    normalizedY: number;
  }>
): {
  basics: typeof rightColumn;
  summary?: typeof rightColumn;
  experience?: typeof rightColumn;
  education?: typeof rightColumn;
} {
  console.log('DEBUG: Following proper 6-step right-column header detection logic');

  // STEP 3: Find all headrule + title font size headers first
  console.log('DEBUG: STEP 3 - Found %d headrules in right column:', rightColumnHeadrules.length, rightColumnHeadrules.map(h => 
    `{ x: ${h.x.toFixed(3)}, y: ${h.y.toFixed(3)}, normalizedY: ${h.normalizedY.toFixed(3)}, page: ${h.page} }`
  ));

  // Find title font headers that are close to headrules (within 2 units)
  const headruleSections: Array<{ 
    originalText: string; 
    schemaSection: string; 
    y: number; 
    page: number;
    headrule: typeof rightColumnHeadrules[0];
  }> = [];
  
  rightColumnHeadrules.forEach(headrule => {
    // Look for title font text items near this headrule (normalized coordinates)
    const nearbyTitleItems = rightColumn.filter(item => 
      item.fontSize >= 18 && 
      Math.abs(item.y - headrule.normalizedY) < 2 && // Use normalized coordinates
      item.text.length > 2
    );
    
    nearbyTitleItems.forEach(item => {
      const schemaSection = mapToSchemaSection(item.text);
      if (schemaSection) {
        headruleSections.push({
          originalText: item.text,
          schemaSection,
          y: item.y, // Use normalized y-coordinate
          page: item.page,
          headrule
        });
        console.log('DEBUG: STEP 3 - Found headrule section: "%s" → "%s" (y=%s, page=%d)', 
          item.text, schemaSection, item.y.toFixed(3), item.page);
      }
    });
  });

  // STEP 4: If (and only if) Experience is not detected by step 3, check for exception case
  let experienceSection: { y: number; page: number } | null = null;
  const experienceFromHeadrules = headruleSections.find(s => s.schemaSection === 'Experience');
  
  if (experienceFromHeadrules) {
    experienceSection = { y: experienceFromHeadrules.y, page: experienceFromHeadrules.page };
    console.log('DEBUG: STEP 4 - Experience found via headrule at y=%s', experienceSection.y);
  } else {
    console.log('DEBUG: STEP 4 - Experience NOT found via headrule, checking exception case');
    
    // Exception case: No Summary and "Experience" is listed in title font case below name-label-location
    const hasSummary = rightColumn.some(item => 
      item.fontSize >= 18 && item.text.toLowerCase() === 'summary'
    );
    
    if (!hasSummary) {
      console.log('DEBUG: STEP 4 - No Summary detected, looking for standalone Experience');
      
      // Look for Experience in title font (fontSize >= 18)
      const experienceCandidate = rightColumn.find(item => 
        item.fontSize >= 18 && 
        item.text.toLowerCase() === 'experience'
      );
      
      if (experienceCandidate) {
        experienceSection = { y: experienceCandidate.y, page: experienceCandidate.page };
        console.log('DEBUG: STEP 4 - Exception case: Found standalone Experience at y=%s', experienceSection.y);
      } else {
        console.log('DEBUG: STEP 4 - No standalone Experience found in title font');
      }
    } else {
      console.log('DEBUG: STEP 4 - Summary exists, no exception case applies');
    }
  }

  if (!experienceSection) {
    console.log('DEBUG: STEP 4 - No Experience section found by any method');
    return {
      basics: rightColumn // Everything is basics if no Experience found
    };
  }

  // STEP 5: Define everything above "Experience" to be "basics" content
  const basicsItems = rightColumn.filter(item => 
    item.page < experienceSection!.page ||
    (item.page === experienceSection!.page && item.y < experienceSection!.y)
  );
  
  console.log('DEBUG: STEP 5 - Basics section: everything above Experience (y=%s) = %d items', 
    experienceSection.y, basicsItems.length);

  // STEP 6: Now we should have basic, experience and education sections defined
  const sections: {
    basics: typeof rightColumn;
    summary?: typeof rightColumn;
    experience?: typeof rightColumn;
    education?: typeof rightColumn;
  } = {
    basics: basicsItems
  };

  // Find all section boundaries (Experience + any headrule sections)
  const allSections = [
    { name: 'Experience', y: experienceSection.y, page: experienceSection.page },
    ...headruleSections
      .filter(s => s.schemaSection !== 'Experience') // Don't duplicate Experience
      .map(s => ({ name: s.schemaSection, y: s.y, page: s.page }))
  ];

  // Sort all sections by position
  allSections.sort((a, b) => a.page !== b.page ? a.page - b.page : a.y - b.y);

  console.log('DEBUG: STEP 6 - All sections detected:', allSections);

  // Extract content for each section
  allSections.forEach((section, index) => {
    const nextSection = allSections[index + 1];
    
    let sectionItems: typeof rightColumn;
    if (nextSection) {
      // Items between this section and the next
      sectionItems = rightColumn.filter(item => 
        item.y > section.y && 
        (item.page < nextSection.page || 
         (item.page === nextSection.page && item.y < nextSection.y))
      );
    } else {
      // Items from this section to end of document
      sectionItems = rightColumn.filter(item => 
        item.y > section.y && item.page >= section.page
      );
    }
    
    console.log('DEBUG: STEP 6 - Section "%s" has %d items (y=%s to %s)', 
      section.name, sectionItems.length, section.y, nextSection?.y || 'end');

    // Assign to appropriate section
    const sectionName = section.name.toLowerCase();
    if (sectionName === 'experience') {
      sections.experience = sectionItems;
    } else if (sectionName === 'education') {
      sections.education = sectionItems;
    }
  });

  // Handle Summary separately if it exists in basics
  const summaryItem = basicsItems.find(item => 
    item.fontSize >= 18 && item.text.toLowerCase() === 'summary'
  );
  
  if (summaryItem) {
    // Extract summary content (from Summary header to Experience section)
    const summaryItems = basicsItems.filter(item => item.y >= summaryItem.y);
    sections.summary = summaryItems;
    
    // Remove summary items from basics (keep only name-label-location)
    sections.basics = basicsItems.filter(item => item.y < summaryItem.y);
    
    console.log('DEBUG: STEP 6 - Extracted Summary section (%d items), Basics now %d items', 
      summaryItems.length, sections.basics.length);
  }

  console.log('DEBUG: STEP 6 - Final sections: basics=%d, summary=%d, experience=%d, education=%d',
    sections.basics.length,
    sections.summary?.length || 0,
    sections.experience?.length || 0,
    sections.education?.length || 0
  );

  // Collect metrics: right column sections
  if (currentMetrics) {
    currentMetrics.rightColumnSections.basics = sections.basics.length;
    if (sections.summary) currentMetrics.rightColumnSections.summary = sections.summary.length;
    if (sections.experience) currentMetrics.rightColumnSections.experience = sections.experience.length;
    if (sections.education) currentMetrics.rightColumnSections.education = sections.education.length;
    
    // Count detected sections (non-zero sections)
    currentMetrics.sectionsDetected = Object.values(currentMetrics.rightColumnSections).filter(count => count > 0).length +
                                     Object.values(currentMetrics.leftColumnSections).filter(count => count > 0).length;
  }

  return sections;
}

function buildJSONResume(
  leftSections: { [sectionName: string]: any[] },
  rightSections: { basics: any[]; summary?: any[]; experience?: any[]; education?: any[] }
): JSONResume {
  const resume: JSONResume = {
    $schema: "https://jsonresume.org/schema/1.0.0/resume.json",
    basics: parseBasics(rightSections.basics),
    work: rightSections.experience ? parseExperience(rightSections.experience) : [],
    education: rightSections.education ? parseEducation(rightSections.education) : [],
  };
  
  // Add Summary to basics if present
  if (rightSections.summary && resume.basics) {
    const summaryText = parseSummary(rightSections.summary);
    if (summaryText) {
      resume.basics.summary = summaryText;
    }
  }
  
  // Add left column sections using schema-based keys
  if (leftSections['Skills']) {
    resume.skills = parseSkills(leftSections['Skills'] || []);
  }
  
  if (leftSections['Certifications']) {
    resume.certificates = parseCertificates(leftSections['Certifications'] || []);
  }
  
  if (leftSections['Languages']) {
    resume.languages = parseLanguages(leftSections['Languages'] || []);
  }
  
  if (leftSections['Awards']) {
    resume.awards = parseAwards(leftSections['Awards'] || []);
  }
  
  if (leftSections['Projects']) {
    resume.projects = parseProjects(leftSections['Projects'] || []);
  }
  
  if (leftSections['Publications']) {
    resume.publications = parsePublications(leftSections['Publications'] || []);
  }
  
  if (leftSections['Volunteer']) {
    resume.volunteer = parseVolunteer(leftSections['Volunteer'] || []);
  }
  
  // Merge contact info from left column into basics
  if (leftSections['Contact'] && resume.basics) {
    mergeContactInfo(resume.basics, leftSections['Contact']);
  }
  
  // Collect final metrics: parsed results
  if (currentMetrics && resume.basics) {
    currentMetrics.hasName = !!resume.basics.name;
    currentMetrics.hasLabel = !!resume.basics.label;
    currentMetrics.hasLocation = !!(resume.basics.location?.address || resume.basics.location?.city);
    currentMetrics.hasEmail = !!resume.basics.email;
    currentMetrics.hasLinkedIn = !!(resume.basics.profiles?.[0]?.url);
    currentMetrics.summaryLength = resume.basics.summary?.length || 0;
    
    currentMetrics.workEntriesParsed = resume.work?.length || 0;
    currentMetrics.educationEntriesParsed = resume.education?.length || 0;
    
    currentMetrics.skillsCount = resume.skills?.length || 0;
    currentMetrics.languagesCount = resume.languages?.length || 0;
    currentMetrics.publicationsCount = resume.publications?.length || 0;
    currentMetrics.awardsCount = resume.awards?.length || 0;
    currentMetrics.certificatesCount = resume.certificates?.length || 0;
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
    item.text.length > 2 && // Allow shorter continuation words like "tell"
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
  
  // Location detection using color - location text has consistent outlineColor
  const locationItems = basicsItems.filter(item => 
    hasOutlineColor(item, 'LOCATION_TEXT')
  );
  if (locationItems.length > 0) {
    const locationText = locationItems[0].text;
    basics.location = parseLocationText(locationText);
    console.log(`DEBUG: Found location (color-based): "${locationText}"`);
  }
  
  // Summary will now be handled separately as its own section
  
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
      
      // Collect metrics: work entries detected
      if (currentMetrics) {
        currentMetrics.workEntriesDetected++;
      }
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
  
  if (educationItems.length === 0) {
    return [];
  }
  
  console.log(`DEBUG: Education items:`, educationItems.slice(0, 5).map(item => ({
    text: item.text,
    fontSize: item.fontSize,
    y: item.y
  })));
  
  const educationEntries: JSONResumeEducation[] = [];
  
  // Group items by institution - institutions are typically fontSize 15
  const institutionItems = educationItems.filter(item => 
    item.fontSize === 15 && 
    item.text !== 'Education' && // Skip the header
    item.text.length > 3 // Meaningful content
  );
  
  for (const institutionItem of institutionItems) {
    const institutionName = institutionItem.text;
    
    // Find items related to this institution (within reasonable y range)
    const relatedItems = educationItems.filter(item => 
      item.y > institutionItem.y && 
      item.y < institutionItem.y + 10 // within 10 units
    );
    
    // Look for degree/program info (fontSize 13.5, contains degree-related terms)
    const degreeItems = relatedItems.filter(item => 
      item.fontSize === 13.5 && 
      (item.text.includes('Bachelor') || 
       item.text.includes('Master') || 
       item.text.includes('PhD') || 
       item.text.includes('Doctor') || 
       item.text.includes('BS') || 
       item.text.includes('MS') || 
       item.text.includes('BA') || 
       item.text.includes('MA') ||
       item.text.includes('Secondary') ||
       item.text.includes('Computer Science') ||
       item.text.includes('Engineering') ||
       item.text.includes('Science') ||
       item.text.includes('Technology') ||
       item.text.includes('Business') ||
       item.text.includes('Arts'))
    );
    
    // Look for date info (contains years)
    const dateItems = relatedItems.filter(item => 
      item.fontSize === 13.5 && 
      /\d{4}/.test(item.text) &&
      (item.text.includes('-') || item.text.includes('(') || item.text.includes('·'))
    );
    
    if (degreeItems.length > 0) {
      const degreeText = degreeItems.map(item => item.text).join(' ');
      
      // Extract degree type and area
      let studyType = '';
      let area = '';
      
      if (degreeText.includes('Bachelor') || degreeText.includes('BS') || degreeText.includes('BA')) {
        studyType = 'Bachelor';
      } else if (degreeText.includes('Master') || degreeText.includes('MS') || degreeText.includes('MA')) {
        studyType = 'Master';
      } else if (degreeText.includes('PhD') || degreeText.includes('Doctor')) {
        studyType = 'PhD';
      } else if (degreeText.includes('Secondary')) {
        studyType = 'Secondary Education';
      }
      
      // Extract field/area
      if (degreeText.includes('Computer Science')) {
        area = 'Computer Science';
      } else if (degreeText.includes('Data Science')) {
        area = 'Data Science';
      } else if (degreeText.includes('Statistics')) {
        area = 'Statistics';
      } else if (degreeText.includes('Engineering')) {
        area = 'Engineering';
      } else if (degreeText.includes('Business')) {
        area = 'Business';
      } else if (degreeText.includes('Biotechnology')) {
        area = 'Biotechnology';
      }
      
      // Extract dates if available
      let startDate: string | undefined;
      let endDate: string | undefined;
      
      if (dateItems.length > 0) {
        const dateText = dateItems[0].text;
        const yearMatches = dateText.match(/\d{4}/g);
        if (yearMatches && yearMatches.length >= 2) {
          startDate = yearMatches[0];
          endDate = yearMatches[1];
        } else if (yearMatches && yearMatches.length === 1) {
          endDate = yearMatches[0];
        }
      }
      
      const entry: JSONResumeEducation = {
        institution: institutionName,
        studyType: studyType || undefined,
        area: area || undefined,
        startDate,
        endDate
      };
      
      educationEntries.push(entry);
      console.log(`DEBUG: Found education entry: ${entry.institution} - ${entry.studyType || 'No degree'} in ${entry.area || 'Unknown field'}`);
      
      // Collect metrics: education entries detected
      if (currentMetrics) {
        currentMetrics.educationEntriesDetected++;
      }
    }
  }
  
  return educationEntries;
}

function parseSkills(skillItems: any[]): JSONResumeSkill[] {
  console.log(`DEBUG: Parsing skills from ${skillItems.length} items`);
  return skillItems.map(item => ({ name: item.text }));
}

function parseCertificates(certItems: any[]): JSONResumeCertificate[] {
  console.log(`DEBUG: Parsing certificates from ${certItems.length} items`);
  return certItems.map(item => ({ name: item.text }));
}

function parseLanguages(languageItems: any[]): JSONResumeLanguage[] {
  return languageItems.map(item => ({
    language: item.text
  }));
}

function parseAwards(awardItems: any[]): JSONResumeAward[] {
  return awardItems.map(item => ({
    title: item.text
  }));
}

function parseProjects(projectItems: any[]): JSONResumeProject[] {
  return projectItems.map(item => ({
    name: item.text
  }));
}

function parsePublications(publicationItems: any[]): JSONResumePublication[] {
  return publicationItems.map(item => ({
    name: item.text
  }));
}

function parseVolunteer(volunteerItems: any[]): JSONResumeVolunteer[] {
  return volunteerItems.map(item => ({
    organization: item.text
  }));
}

function parseSummary(summaryItems: any[]): string | undefined {
  if (!summaryItems || summaryItems.length === 0) {
    return undefined;
  }
  
  // Filter out the header itself and extract content
  const contentItems = summaryItems.filter(item => 
    item.text !== 'Summary' && 
    item.fontSize < 18 && // Not a header
    item.text.length > 3 // Meaningful content
  );
  
  if (contentItems.length === 0) {
    return undefined;
  }
  
  // Sort by y position and combine text
  contentItems.sort((a, b) => a.y - b.y);
  const summaryText = contentItems.map(item => item.text).join(' ').trim();
  
  console.log('DEBUG: Parsed summary from %d items: "%s"', contentItems.length, summaryText);
  
  return summaryText;
}
