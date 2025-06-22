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
- [ ] Parse Skills section
- [ ] Parse Certificates section
- [ ] Parse Languages section
- [ ] Include Projects section
- [ ] JSON Resume schema typings & validation

### 🧠 Heuristic Improvements 0.4.0
- [x] **Significantly improved content parsing accuracy**
- [x] **Enhanced location detection (major cities, complex addresses)**
- [x] **Better highlight content separation and structuring**
- [ ] Refine company detection (multi-line names, edge cases)
- [ ] Smarter location parsing (geo lookup / normalization)
- [ ] Disambiguate overlapping date ranges in nested positions

### ⏳ Release Preparation 0.5.0 (IN PROGRESS)
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

_Last updated: 2025-01-27_ 