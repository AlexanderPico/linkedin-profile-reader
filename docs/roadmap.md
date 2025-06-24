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

### ✅ New Fixture Integration 0.5.0 (COMPLETED)
- [x] **Added new test fixtures**: Integrated zhirui and zainab profiles
- [x] **Fixed phone number parsing**: Improved detection to avoid false positives from:
  - Year ranges (e.g., "2014 - 2019" no longer parsed as phone)
  - LinkedIn username fragments (e.g., "49667449" in LinkedIn URLs)
  - Split LinkedIn URLs across PDF lines
- [x] **Enhanced location parsing**: Better separation of location vs. label/headline text
- [x] **Improved label detection**: Academic/professional keywords now properly detected
- [x] **Schema compliance**: Updated field names to match JSON Resume schema (countryCode vs country)
- [x] **All tests passing**: 15/15 test cases now pass including new fixtures

### ⏳ Release Preparation 0.6.0 (FUTURE)
- [ ] Benchmark large number of PDFs
- [ ] Publish first beta to npm (`npm publish --access public`)
- [ ] Generate & upload documentation to GitHub Pages
- [ ] Add semantic-release or changesets for version automation

### 📊 Quality & DX 0.7.0
- [ ] Add code-coverage reporting to CI
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

## Recent New Fixture Integration (v0.5.0)

### 🆕 **New Test Fixtures**
- **Zhirui Hu**: Academic profile with computational biology/statistics/ML background
- **Zainab Yusuf-Sada**: Administrative professional with project management experience

### 🔧 **Phone Number Parsing Fixes**
- **Year range exclusion**: Prevents date ranges like "2014 - 2019" from being parsed as phone numbers
- **LinkedIn username filtering**: Avoids extracting phone-like numbers from LinkedIn usernames (e.g., "49667449" in "brianna-swanson-shrm-cp-49667449")
- **Split URL handling**: Correctly handles LinkedIn URLs that are split across PDF lines

### 🎯 **Location vs Label Parsing**
- **Academic keyword detection**: Properly identifies academic/professional terms like "computational biology", "statistics", "machine learning" as labels rather than locations
- **Location filtering**: Enhanced location detection to avoid academic/professional keywords
- **Schema compliance**: Updated to use `countryCode` field instead of `country` per JSON Resume schema

### ✅ **Test Results**
- **15/15 tests passing**: All existing and new fixtures now parse correctly
- **No regressions**: All previously working profiles continue to work as expected
- **Schema validation**: All outputs comply with JSON Resume schema requirements

_Last updated: 2025-01-27_ 