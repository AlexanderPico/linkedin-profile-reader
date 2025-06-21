# Project Roadmap

> This document is the single source of truth for ongoing work. **Please update the checkboxes whenever a task is started (`[ ] ➜ [ ]*`) or completed (`[ ]/[*] ➜ [x]`) so the status always reflects the codebase.**

## Milestones

### ✅ MVP 0.1.0 – Working TS library + CLI (DONE)
- [x] Create project skeleton with `src/`, `bin/`, `tests/`, configs
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

### 🚧 Feature Expansion 0.3.0 (NEXT)
- [ ] Parse Education section
- [ ] Parse Skills section
- [ ] Include Certifications and Projects
- [ ] JSON Schema typings for output

### 🧠 Heuristic Improvements 0.4.0
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

_Last updated: 2025-06-21_ 