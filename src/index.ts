/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO

import PDFParser from 'pdf2json';
// import { debugConsole, debugIf, isDebugEnabled } from './debug.js';

// Debug helper function that can be controlled via command line arguments
// Check if debug is enabled via command line arguments
const debugArg = process.argv.find(arg => arg.startsWith('--debug'));
const debugEnabled = debugArg !== undefined;
// const debugKeyword = debugArg?.includes('=') ? debugArg.split('=')[1] : '';

/**
 * Debug logging function that only outputs when debug is enabled
 * Usage: debug('Some debug message', variable1, variable2);
 */
const debug = (...args: any[]): void => {
  if (debugEnabled) {
    console.log(...args);
  }
};

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
  name: string;
  position: string;
  location?: string;
  startDate?: string | null;
  endDate?: string | null;
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
  // Initialize metrics collection
  initializeMetrics();

  // Create a new parser instance
  const pdfParser = new PDFParser();

  // Parse the PDF
  const pdfData = await new Promise<PDFData>((resolve, reject) => {
    pdfParser.on('pdfParser_dataReady', (pdfData) => resolve(pdfData as PDFData));
    pdfParser.on('pdfParser_dataError', reject);

    if (typeof pdfInput === 'string') {
      pdfParser.loadPDF(pdfInput);
    } else {
      pdfParser.parseBuffer(pdfInput);
    }
  });

  // Parse the PDF data into JSON Resume format
  const jsonResume = parsePDFData(pdfData);

  return jsonResume;
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
  debug(`\n=== RIGHT COLUMN CONTENT DEBUG ===`);
  debug(`Total items: ${rightColumn.length}`);
  
  // Sort by y position for easier reading
  const sortedItems = [...rightColumn].sort((a, b) => a.y - b.y);
  
  debug(`\nRight column items (sorted by y-position):`);
  sortedItems.forEach((item, index) => {
    const originalPageInfo = item.originalPage ? ` (orig: page ${item.originalPage})` : '';
    const indexStr = (index + 1).toString().padStart(3);
    const yStr = item.y.toFixed(3).padStart(8);
    const fontSizeStr = item.fontSize.toString().padStart(4);
    debug(`${indexStr}. y=${yStr} | fontSize=${fontSizeStr} | "${item.text}"${originalPageInfo}`);
  });
  
  // Analyze y-value gaps to identify potential section boundaries
  debug(`\nY-value gap analysis:`);
  for (let i = 1; i < sortedItems.length; i++) {
    const gap = sortedItems[i].y - sortedItems[i-1].y;
    if (gap > 2.0) { // Significant gap
      debug(`  Large gap (${gap.toFixed(3)}) between "${sortedItems[i-1].text}" and "${sortedItems[i].text}"`);
    }
  }
  debug(`=== END RIGHT COLUMN DEBUG ===\n`);
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
  debug(`Starting page break normalization for ${textItems.length} text items and ${headrules.length} headrules`);
  
  // STEP 1: Find and remove page number sequences like "Page", "1", "of", "2"
  const pageNumberItems: typeof textItems = [];
  
  for (let i = 0; i < textItems.length - 3; i++) {
    const current = textItems[i];
    const next1 = textItems[i + 1];
    const next2 = textItems[i + 2];
    const next3 = textItems[i + 3];
    
    // Check if this is a "Page X of Y" sequence
    if (
      current.text === 'Page' &&
      current.fontSize === 12 &&
      next1.fontSize === 12 &&
      /^\d+$/.test(next1.text) && // Current page number
      next2.text === 'of' &&
      next2.fontSize === 12 &&
      next3.fontSize === 12 &&
      /^\d+$/.test(next3.text) && // Total pages
      Math.abs(current.y - next1.y) < 1 && // Same line
      Math.abs(current.y - next2.y) < 1 && // Same line
      Math.abs(current.y - next3.y) < 1    // Same line
    ) {
      pageNumberItems.push(current, next1, next2, next3);
      debug(`Found page number sequence: "${current.text} ${next1.text} ${next2.text} ${next3.text}" at y=${current.y.toFixed(3)}, page=${current.page}`);
    }
  }
  
  debug(`Found ${pageNumberItems.length} page number items to remove`);
  
  // Remove page number items
  const filteredTextItems = textItems.filter(item => !pageNumberItems.includes(item));
  
  // Update metrics
  if (currentMetrics) {
    currentMetrics.pageBreaksRemoved = pageNumberItems.length / 4; // Each page break consists of 4 items
  }
  
  debug(`Removed ${pageNumberItems.length} page number items (${pageNumberItems.length / 4} page breaks)`);
  debug(`Filtered ${textItems.length} items to ${filteredTextItems.length} items`);
  
  // STEP 2: Group items by page and find the maximum Y value for each page
  const pageMaxY: { [page: string]: number } = {};
  filteredTextItems.forEach(item => {
    const pageKey = item.page.toString();
    if (!pageMaxY[pageKey] || item.y > pageMaxY[pageKey]) {
      pageMaxY[pageKey] = item.y;
    }
  });
  
  // Also check headrules for page boundaries
  headrules.forEach(headrule => {
    const pageKey = headrule.page.toString();
    if (!pageMaxY[pageKey] || headrule.y > pageMaxY[pageKey]) {
      pageMaxY[pageKey] = headrule.y;
    }
  });
  
  debug('Page Y ranges:', Object.keys(pageMaxY).map(page => ({
    page: parseInt(page),
    maxY: pageMaxY[page]
  })));
  
  // STEP 3: Calculate page offsets for normalization using footer algorithm
  // Find footer "Page" line y positions (before removal)
  const footerY: { [page: string]: number } = {};
  pageNumberItems.forEach(item => {
    if (item.text === 'Page') {
      footerY[item.page.toString()] = item.y;
    }
  });

  const pageOffsets: { [page: string]: number } = {};
  let cumulativeOffset = 0;

  const sortedPages = Object.keys(pageMaxY).map(p => parseInt(p)).sort((a,b)=>a-b);

  for (let i = 0; i < sortedPages.length - 1; i++) {
    const currentPage = sortedPages[i];
    const nextPage = sortedPages[i+1];

    // Determine footer y for current page; if missing, fallback to maxY
    const footer = footerY[currentPage.toString()] ?? pageMaxY[currentPage.toString()];
    const offset = footer - 2.83; // algorithm: add footerY, subtract margin
    cumulativeOffset += offset;
    pageOffsets[nextPage.toString()] = cumulativeOffset;
  }

  debug('Page offsets for normalization:', pageOffsets);
  
  // STEP 4: Apply normalization to text items
  const normalizedTextItems = filteredTextItems.map(item => ({
    ...item,
    y: item.y + (pageOffsets[item.page.toString()] || 0),
    originalPage: item.page
  }));
  
  // Debug: Check y-spacing between pages after normalization
  for (let i = 0; i < sortedPages.length - 1; i++) {
    const currentPage = sortedPages[i];
    const nextPage = sortedPages[i + 1];
    
    // Find last item on current page and first item on next page (after normalization)
    const currentPageItems = normalizedTextItems.filter(item => item.originalPage === currentPage);
    const nextPageItems = normalizedTextItems.filter(item => item.originalPage === nextPage);
    
    if (currentPageItems.length > 0 && nextPageItems.length > 0) {
      const lastItemCurrentPage = currentPageItems.reduce((max, item) => item.y > max.y ? item : max);
      const firstItemNextPage = nextPageItems.reduce((min, item) => item.y < min.y ? item : min);
      
      const ySpacing = firstItemNextPage.y - lastItemCurrentPage.y;
      
      
      debug(`Page ${currentPage} → ${nextPage}: Last item y=${lastItemCurrentPage.y.toFixed(3)} ("${lastItemCurrentPage.text}"), First item y=${firstItemNextPage.y.toFixed(3)} ("${firstItemNextPage.text}"), Spacing=${ySpacing.toFixed(3)}`);
    }
  }
  
  // STEP 5: Apply normalization to headrules (simplified - no special cross-page handling needed)
  const normalizedHeadrules = headrules.map(headrule => {
    const normalizedY = headrule.y + (pageOffsets[headrule.page.toString()] || 0);
    
    return {
      ...headrule,
      y: normalizedY,
      originalPage: headrule.page,
      normalizedY: normalizedY
    };
  });
  
  return {
    normalizedTextItems,
    normalizedHeadrules,
    pageOffsets
  };
}

function parsePDFData(pdfData: PDFData): JSONResume {
  console.log('=== Starting PDF Analysis ===');
  console.log(`Total pages: ${pdfData.Pages.length}`);

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

  // STEP 1b: Extract all headrules (HLines) from all pages
  const allHeadrules: Array<{
    x: number;
    y: number;
    w: number;
    l: number;
    page: number;
  }> = [];

  pdfData.Pages.forEach((page: PDFPage, pageIndex: number) => {
    console.log(`\nAnalyzing Page ${pageIndex + 1}:`);
    console.log(`- Text items: ${page.Texts.length}`);
    console.log(`- HLines: ${page.HLines?.length || 0}`);
    console.log(`- VLines: ${page.VLines?.length || 0}`);
    console.log(`- Width: ${page.Width}, Height: ${page.Height}`);

    // Extract text items
    page.Texts.forEach((textItem: PDFTextItem) => {
      const { text, fontSize, color, outlineColor } = extractTextContent(textItem);
      if (text.trim()) {
        if (fontSize >= 18) {
          console.log(`Large text found: "${text}" (size: ${fontSize}, x: ${textItem.x}, y: ${textItem.y})`);
        }
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

    // Extract headrules
    if (page.HLines) {
      console.log(`Found ${page.HLines.length} headrules on page ${pageIndex + 1}:`);
      page.HLines.forEach((line: any) => {
        console.log(`- Headrule: x=${line.x}, y=${line.y}, w=${line.w}, l=${line.l}`);
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

  console.log(`\nTotal items found:`);
  console.log(`- Text items: ${allTextItems.length}`);
  console.log(`- Headrules: ${allHeadrules.length}`);
  
  // Collect metrics: document analysis
  if (currentMetrics) {
    currentMetrics.totalTextItems = allTextItems.length;
    currentMetrics.totalPages = pdfData.Pages.length;
  }
  
  console.log(`Total text items: ${allTextItems.length}`);
  console.log(`Total headrules: ${allHeadrules.length}`);
  console.log(`First 10 items:`, allTextItems.slice(0, 10));
  
  // STEP 2: Normalize page breaks for ALL content (text + headrules)
  const { normalizedTextItems, normalizedHeadrules } = normalizeAllContent(allTextItems, allHeadrules);
  
  // STEP 3: Separate left and right columns (now with normalized coordinates)
  const { leftColumn, rightColumn } = separateColumns(normalizedTextItems);
  console.log(`Left column: ${leftColumn.length} items`);
  console.log(`Right column: ${rightColumn.length} items`);
  
  // Filter headrules to right column only (x > column boundary)
  const rightColumnHeadrules = normalizedHeadrules.filter(h => h.x > 10); // Use same threshold as before
  console.log(`Right column headrules: ${rightColumnHeadrules.length}`);
  
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
  
  // Debug: Show all title font headers
  const titleHeaders = rightColumn.filter(item => item.fontSize >= 18 && item.text.length > 2);
  console.log('DEBUG: Title font headers:', titleHeaders.map(h => 
    `"${h.text}" at y=${h.y.toFixed(3)} (page ${h.page})`
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
    // Allow headers to appear slightly before their headrules (up to 2 units)
    // or slightly after (up to 2 units)
    const nearbyTitleItems = rightColumn.filter(item => 
      item.fontSize >= 18 && 
      item.y >= headrule.normalizedY - 2 && // Header can be up to 2 units before headrule
      item.y <= headrule.normalizedY + 2 && // Or up to 2 units after headrule
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
  console.log(`Parsing experience from ${experienceItems.length} items`);
  
  if (!experienceItems || experienceItems.length === 0) {
    console.log('No experience items found');
    return [];
  }

  // Debug: Print all experience items
  console.log('Experience items:', experienceItems.map(item => ({
    text: item.text,
    fontSize: item.fontSize,
    y: item.y
  })));

  const workEntries: JSONResumeWork[] = [];
  // Remove unused variables
  // let currentCompany = '';
  // let i = 0;

  // STEP 1: Identify companies (fontSize = 15)
  const companies = experienceItems.filter(item => item.fontSize === 15);
  console.log(`Found ${companies.length} companies:`, companies.map(c => c.text));

  // STEP 2: Identify positions (fontSize = 14.5)  
  const positions = experienceItems.filter(item => item.fontSize === 14.5);
  console.log(`Found ${positions.length} positions:`, positions.map(p => p.text));

  // STEP 3: Helper functions for date and location detection
  const isDate = (text: string): boolean => {
    return /\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}\/\d{4}|\d{4})\b/i.test(text) ||
           /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i.test(text) ||
           /\b\d{4}\s*[-–—]\s*\d{4}\b/.test(text) ||
           /\bPresent\b/i.test(text) ||
           /\(\d+\s+(year|month)/i.test(text);
  };

  const isLocation = (item: any): boolean => {
    // Check for location by color (gray colors)
    return isColorInRange(item.color, PDF_COLOR_RANGES.LOCATION_TEXT) ||
           hasOutlineColor(item, 'LOCATION_TEXT') ||
           // Fallback: common location patterns
           /\b(Area|City|State|Country|United States|California|New York|Campus)\b/i.test(item.text);
  };

  const isUrl = (text: string): boolean => {
    return /\.(org|com|edu|net|gov)($|\/)/i.test(text) ||
           /^https?:\/\//i.test(text) ||
           /^www\./i.test(text);
  };

  // STEP 4: Process each position
  for (let posIndex = 0; posIndex < positions.length; posIndex++) {
    const position = positions[posIndex];
    const nextPosition = positions[posIndex + 1];
    
    // Find the company for this position (most recent company before this position)
    let companyForPosition = '';
    for (const company of companies) {
      if (company.y <= position.y) {
        companyForPosition = company.text;
      } else {
        break;
      }
    }

    console.log(`Processing position "${position.text}" under company "${companyForPosition}"`);

    // Find items between this position and the next position (or end)
    const positionEndY = nextPosition ? nextPosition.y : Infinity;
    const positionItems = experienceItems.filter(item => 
      item.y > position.y && item.y < positionEndY
    );

    // STEP 5: Extract dates, location, URLs, and highlights
    let dateRange = '';
    let location = '';
    let url = '';
    const highlights: string[] = [];

    for (const item of positionItems) {
      if (isDate(item.text)) {
        if (item.text.includes('(') && item.text.includes('month')) {
          // Duration information captured but not used in work entry
        } else {
          dateRange = item.text;
        }
      } else if (isLocation(item)) {
        location = item.text;
      } else if (isUrl(item.text)) {
        url = item.text;
        // Add https:// prefix if not present
        if (!url.startsWith('http')) {
          url = 'https://' + url;
        }
      } else {
        // Check if this might be a highlight (larger y-gap or bullet point)
        const isHighlight = item.text.startsWith('•') || 
                           item.text.startsWith('-') ||
                           item.text.startsWith('*') ||
                           (item.fontSize <= 13.5 && item.text.length > 10);
        
        if (isHighlight) {
          highlights.push(item.text);
        }
      }
    }

    // STEP 6: Create work entry
    if (companyForPosition && position.text) {
      const workEntry: JSONResumeWork = {
        name: companyForPosition,
        position: position.text,
        startDate: extractStartDate(dateRange),
        endDate: extractEndDate(dateRange),
        location: location || undefined,
        url: url || undefined,
        highlights: highlights.length > 0 ? highlights : undefined
      };

      workEntries.push(workEntry);
      console.log(`Created work entry:`, workEntry);
    }
  }

  // Update metrics
  if (currentMetrics) {
    currentMetrics.workEntriesDetected = positions.length;
    currentMetrics.workEntriesParsed = workEntries.length;
  }

  console.log(`Successfully parsed ${workEntries.length} work entries from ${positions.length} positions`);
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
  // Look for end date after " - " (space before dash, space after dash)
  const match = dateText.match(/\s-\s(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
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

// Helper function to detect degree type using degreeSet strategy
// const detectDegreeType = (text: string): string | undefined => {

function parseEducation(educationItems: any[]): JSONResumeEducation[] {
  console.log(`Parsing education from ${educationItems.length} items`);
  
  if (!educationItems || educationItems.length === 0) {
    console.log('No education items found');
    return [];
  }

  // Debug: Print all education items
  console.log('Education items:', educationItems.map(item => ({
    text: item.text,
    fontSize: item.fontSize,
    y: item.y
  })));

  const educationEntries: JSONResumeEducation[] = [];

  // STEP 1: Identify institutions by font size and preceding y-gaps
  // Calculate baseline line spacing
  const yDiffs: number[] = [];
  for (let i = 1; i < educationItems.length; i++) {
    const diff = educationItems[i - 1].y - educationItems[i].y;
    if (diff > 0 && diff < 40) yDiffs.push(diff);
  }
  yDiffs.sort((a, b) => a - b);
  const baselineGap = yDiffs.length ? yDiffs[Math.floor(yDiffs.length / 2)] : 12;
  console.log(`Education baseline gap: ${baselineGap}`);

  // Find potential institutions (larger font sizes with larger y-gaps)
  const institutions: Array<{ item: any; index: number }> = [];
  
  for (let i = 0; i < educationItems.length; i++) {
    const item = educationItems[i];
    
    // Check if this could be an institution
    // Primary indicator: fontSize = 15 (same pattern as work experience companies)
    const isInstitutionFont = item.fontSize === 15;
    const isLongEnough = item.text.length > 3;
    const isNotDate = !/(19|20)\d{2}/.test(item.text); // Not a year
    const isNotParenthetical = !item.text.startsWith('(');
    const isNotBullet = !item.text.startsWith('·');
    
    if (isInstitutionFont && isLongEnough && isNotDate && isNotParenthetical && isNotBullet) {
      institutions.push({ item, index: i });
      console.log(`Found potential institution: "${item.text}" (fontSize: ${item.fontSize})`);
    }
  }

  console.log(`Found ${institutions.length} potential institutions`);

  // STEP 2 & 3: For each institution, identify subsequent lines and parse them
  for (let instIndex = 0; instIndex < institutions.length; instIndex++) {
    const institution = institutions[instIndex];
    const nextInstitution = institutions[instIndex + 1];
    
    // Get items between this institution and the next (or end)
    const startIndex = institution.index + 1;
    const endIndex = nextInstitution ? nextInstitution.index : educationItems.length;
    const relatedItems = educationItems.slice(startIndex, endIndex);
    
    console.log(`Processing institution: "${institution.item.text}"`);
    console.log(`Related items (${relatedItems.length}):`, relatedItems.map(item => item.text));

    // Parse the related items for degree, area, and dates
    let studyType: string | undefined;
    let area: string | undefined;
    let startDate: string | undefined;
    let endDate: string | undefined;

    // Combine all related text for parsing
    const combinedText = relatedItems.map(item => item.text).join(' ');
    console.log(`Combined text: "${combinedText}"`);

    // Parse for degree types
    const degreePatterns = [
      /\b(PhD|Ph\.?D\.?|Doctor of Philosophy|Doctorate)\b/i,
      /\b(Master|Masters|M\.?S\.?|M\.?A\.?|MBA|M\.?Sc\.?)\b/i,
      /\b(Bachelor|Bachelors|B\.?S\.?|B\.?A\.?|B\.?Sc\.?)\b/i,
      /\b(Associate|A\.?S\.?|A\.?A\.?)\b/i,
      /\b(Certificate|Certification|Cert\.?)\b/i
    ];

    for (const pattern of degreePatterns) {
      const match = combinedText.match(pattern);
      if (match) {
        studyType = match[1];
        break;
      }
    }

    // Parse for area/field of study (text before date in parentheses)
    // Look for pattern: degree? area... (date)
    const areaMatch = combinedText.match(/^(.*?)\s*\(.*?(19|20)\d{2}.*?\)\s*$/);
    if (areaMatch) {
      let areaText = areaMatch[1].trim();
      // Remove degree type from area if it's at the beginning
      if (studyType) {
        areaText = areaText.replace(new RegExp(`^${studyType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,?\\s*`, 'i'), '');
      }
      // Clean up bullet points and extra characters
      areaText = areaText.replace(/\s*·\s*/g, ' ').trim();
      area = areaText;
    } else {
      // Fallback: use text that's not a date or bullet
      const nonDateText = relatedItems
        .filter(item => !/(19|20)\d{2}/.test(item.text) && !item.text.match(/^\([^)]*\)$/) && !item.text.startsWith('·'))
        .map(item => item.text)
        .join(' ')
        .trim();
      if (nonDateText) {
        // Remove degree type from area if it's at the beginning
        let cleanArea = nonDateText;
        if (studyType) {
          cleanArea = cleanArea.replace(new RegExp(`^${studyType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,?\\s*`, 'i'), '');
        }
        area = cleanArea.trim();
      }
    }

    // Parse dates from parenthetical expressions
    const dateInParens = combinedText.match(/\(([^)]*?(19|20)\d{2}[^)]*?)\)/);
    if (dateInParens) {
      const dateText = dateInParens[1];
      console.log(`Found date text: "${dateText}"`);
      
      // Extract start and end years
      const years = dateText.match(/(19|20)\d{2}/g);
      if (years) {
        startDate = years[0];
        if (years.length > 1) {
          endDate = years[1];
        }
      }
    } else {
      // Look for standalone years
      const years = combinedText.match(/(19|20)\d{2}/g);
      if (years) {
        startDate = years[0];
        if (years.length > 1) {
          endDate = years[1];
        }
      }
    }

    // Create education entry
    const educationEntry: JSONResumeEducation = {
      institution: institution.item.text,
      studyType: studyType || undefined,
      area: area || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    };

    console.log(`Created education entry:`, educationEntry);
    educationEntries.push(educationEntry);
  }

  // Update metrics
  if (currentMetrics) {
    currentMetrics.educationEntriesDetected = institutions.length;
    currentMetrics.educationEntriesParsed = educationEntries.length;
  }

  console.log(`Successfully parsed ${educationEntries.length} education entries from ${institutions.length} institutions`);
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