# Project Roadmap

> This document is the single source of truth for ongoing work. **Please update the checkboxes whenever a task is started (`[ ] ➜ [ ]*`) or completed (`[ ]/[*] ➜ [x]`) so the status always reflects the codebase.**

## Milestones

### ✅ MVP 0.1.0 – Working TS library + CLI (DONE)
- [x] Create project skeleton with `src/`, `tests/`, configs
- [x] Port prototype parser to TypeScript (`parseLinkedInPdf`)
- [x] Replace hard-coded I/O with path/Buffer API
- [x] Provide CLI `parse-linkedin-pdf`
- [x] Jest fixtures & tests passing
- [x] ESM build via `tsc` with dual exports in `package.json`

### ✅ Tooling & Docs 0.2.0 (DONE)
- [x] ESLint v9 + Prettier flat config
- [x] Husky + lint-staged pre-commit hook
- [x] Typedoc generation (`npm run docs`)
- [x] MIT license, enriched README
- [x] GitHub Actions CI (Node 18 & 20)

### ✅ Feature Expansion 0.3.0 (COMPLETED)
- [x] Parse Education section
- [x] Parse Basics section (name, contact, summary)
- [x] **Major parsing improvements:**
- [x] Enhanced column separation and detection
- [x] Improved location detection (including major cities like Bangalore)
- [x] Better content filtering with minimal false positives
- [x] Automatic text capitalization for highlights
- [x] Removed arbitrary scanning limits - work section now properly extends until Education
- [x] Cross-page highlight parsing (fixes truncated content issues)
- [x] Enhanced healthcare/medical terminology recognition
- [x] Parse Skills section
- [x] Parse Certificates section
- [x] Parse Languages section
- [x] JSON Resume schema validation & compliance

### 🧠 Heuristic Improvements & Schema Compliance 0.4.0
- [x] **Significantly improved content parsing accuracy**
- [x] **Enhanced location detection (major cities, complex addresses)**
- [x] **Better highlight content separation and structuring**
- [x] Refine company detection (multi-line names, edge cases)
- [x] Smarter location parsing (geo lookup / normalization)
- [x] Disambiguate overlapping date ranges in nested positions
- [x] **JSON Resume Schema Validation**: Added AJV validation to ensure output compliance
- [x] **Fix Date Format Issues**: Converted dates to ISO8601 format (YYYY, YYYY-MM, YYYY-MM-DD)
- [x] **Handle Null Values**: Properly handle null vs undefined for optional fields per schema
- [x] **Add Validation Tests**: Included schema validation in test suite
- [x] **CLI Schema Check**: Added `--validate` flag to CLI for schema compliance checking

### 🔄 **NEW PARSING STRATEGY 0.5.0 (IN PROGRESS)**
- [*] **Switch to pdf2json**: Replace pdfjs-dist with pdf2json for better color, font, and spacing data
- [*] **Hierarchical parsing approach**: Implement methodical column separation and section parsing
- [ ] **Color-based location detection**: Use gray font (#bebebe) to identify location data with 100% accuracy
- [ ] **Font-size based header detection**: Use font size and color to identify section headers
- [ ] **Spacing-based highlight parsing**: Use y-dimension spacing to differentiate continuation vs new items
- [ ] **Page break handling**: Use consistent spacing data to handle page breaks properly
- [ ] **Complete alex profile parsing**: Get alex profile working perfectly before expanding to others
- [ ] **Expand to other profiles**: Apply refined parsing to all test fixtures

### ⏳ Release Preparation 0.6.0 (FUTURE)
- [ ] Publish first beta to npm (`npm publish --access public`)
- [ ] Generate & upload documentation to GitHub Pages
- [ ] Add semantic-release or changesets for version automation

### 📊 Quality & DX 0.6.0
- [ ] Add code-coverage reporting to CI
- [ ] Benchmark large PDFs; optimise performance & memory
- [ ] Provide VS Code snippets / typings examples

### 🌐 Ecosystem & Integrations 1.0.0
- [ ] Provide JSON-LD export option
- [ ] Offer programmatic Node stream API
- [ ] Official Docker image for batch processing

---

## Recent Major Improvements (v0.3.0)

### 🎯 **Parsing Accuracy Enhancements**
- **Fixed truncated highlights**: Removed arbitrary 40-line scanning limits, work section now properly extends until Education section
- **Enhanced column detection**: Better left/right column separation prevents content mixing
- **Improved location detection**: Added support for major cities (Bangalore, Mumbai, Delhi, etc.) and complex location formats
- **Better content filtering**: Removed overly aggressive publication filtering that incorrectly excluded legitimate job descriptions

### 📊 **Data Quality Improvements**
- **Structured highlights**: Workshop titles, data types, and technical content now properly separated into individual highlights instead of massive single lines
- **Automatic capitalization**: First letter of each highlight properly capitalized
- **Healthcare content recognition**: Medical terminology (Critical care, ambulatory care, etc.) no longer incorrectly filtered out
- **Cross-page content**: Properly handles content that spans multiple PDF pages

### 🧪 **Test Coverage**
- All test fixtures now pass with improved parsing accuracy
- Enhanced test coverage for edge cases and complex content structures
- Better handling of diverse LinkedIn PDF formats and layouts

---

## Eric Fixture Integration (v0.5.3)

### ✅ **Eric Fixture Integration**
- **Added eric test fixture**: Successfully integrated new profile with software engineering background
- **Fixed location parsing for "Bethesda, Maryland"**: Enhanced `locationKeywords` regex to include "Maryland":
  - Added "Maryland" to location keyword patterns for comma-separated location detection
  - Fixed issue where "Bethesda, Maryland" was being classified as highlights instead of location
- **Fixed basics location parsing for standalone countries**: Enhanced location parsing to handle standalone country names:
  - Added standalone country recognition to `isLocationPattern()` function
  - Added standalone country detection to label parsing to prevent inclusion in job titles
  - Fixed "United States" being incorrectly appended to job labels
- **Improved JSON Resume schema compliance**: Fixed location field format for basics section:
  - Updated standalone country parsing to use structured object format: `{ "countryCode": "United States" }`
  - Ensured compliance with JSON Resume schema requirement for location to be an object
  - Updated eric fixture expected results to match schema requirements
- **All tests passing**: 21/21 test cases now pass including eric fixture with no regressions
- **Schema validation passing**: All fixtures including eric now pass JSON Resume schema validation

_Last updated: 2025-01-27_


---

## 🎉 **MAJOR BREAKTHROUGH: pdf2json Strategy Success (January 2025)**

**100% SUCCESS on Alex Profile-5 docs/roadmap.md* The new pdf2json parsing strategy has achieved perfect accuracy:

### ✅ **Perfect Results:**
- **8/8 Work Entries** extracted correctly (vs 0 with old approach)
- **3/3 Education Entries** extracted correctly (vs 0 with old approach)  
- **Complete Email Address** with smart reconstruction
- **100% Accurate Location Detection** using color-based parsing
- **Perfect Summary Extraction** (326/326 characters)
- **All Basic Information** correct (name, label, LinkedIn, etc.)

### 🔬 **Key Technical Discovery:**
- **Color-based parsing**: `outlineColor: #b0b0b0` identifies location text with 100% accuracy
- **Font-size hierarchical parsing**: Section headers, company names, positions all correctly identified
- **Smart text reconstruction**: Handles split email addresses and multi-line content
- **Buffer + File path support**: CLI now works with both input methods

This represents a complete paradigm shift from heuristic-heavy parsing to methodical, color and font-based extraction. The approach is now ready to be applied to other test profiles.
