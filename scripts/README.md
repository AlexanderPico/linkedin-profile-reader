# Scripts

This directory contains utility scripts for the LinkedIn Profile Reader project.

## `create-fixtures.mjs`

Automatically creates test fixture directories and expected JSON files from Profile.pdf files.

### Usage

1. **Place PDF files directly in the tests directory:**
   ```
   tests/
   ├── Profile.pdf                   # Will be moved to fixture based on name inside PDF
   ├── Profile2.pdf                  # Will be moved to fixture based on name inside PDF  
   ├── AnotherProfile.pdf            # Will be moved to fixture based on name inside PDF
   └── fixtures/                     # Existing fixtures (ignored)
       ├── alex/
       └── benjamin/
   ```

2. **Run the script:**
   ```bash
   npm run fixtures
   # or
   node scripts/create-fixtures.mjs
   ```

3. **The script will:**
   - Scan `tests/` for PDF files directly in the directory (not subdirectories)
   - Parse each PDF to extract the profile name
   - Create fixture directory structure: `tests/fixtures/{firstname}/data/` or `tests/fixtures/{firstname-l}/data/`
   - Move PDF to `tests/fixtures/{name}/data/Profile.pdf` (removes original)
   - Generate `tests/fixtures/{name}/data/Profile.expected.json`
   - Validate output against JSON Resume schema
   - Show summary of extracted data

### Example Output

```
🚀 LinkedIn Profile Fixture Generator
=====================================

📋 Found 2 Profile.pdf file(s):
   - tests/Profile.pdf
   - tests/JohnDoeProfile.pdf

🔄 Pre-parsing PDFs to extract names...
   📄 Parsing tests/Profile.pdf...
      → Profile: Jane Smith
   📄 Parsing tests/JohnDoeProfile.pdf...
      → Profile: John Doe

🏷️  Generating fixture names...
   Jane Smith → jane
   John Doe → john

📁 Creating fixture: jane
   ✅ PDF moved to tests/fixtures/jane/data/Profile.pdf
   🔍 Validating against JSON Resume schema...
   ✅ Schema validation passed
   ✅ Expected JSON written to tests/fixtures/jane/data/Profile.expected.json
   📊 Extracted data:
      - Name: Jane Smith
      - Work: 3 positions
      - Education: 1 entries
      - Skills: 5 skills
      - Certificates: 0 certificates
      - Languages: 2 languages

📁 Creating fixture: john
   ✅ PDF moved to tests/fixtures/john/data/Profile.pdf
   🔍 Validating against JSON Resume schema...
   ✅ Schema validation passed
   ✅ Expected JSON written to tests/fixtures/john/data/Profile.expected.json
   📊 Extracted data:
      - Name: John Doe
      - Work: 5 positions
      - Education: 2 entries
      - Skills: 8 skills
      - Certificates: 3 certificates
      - Languages: 1 languages

==================================================
📊 SUMMARY
==================================================
✅ Successfully created: 2 fixtures
   ✅ jane
   ✅ john

🧪 Next steps:
   - Run: npm test
   - Review generated expected JSON files
   - Adjust parsing logic if needed
```

### Features

- **Smart naming**: Extracts fixture names from directory structure or filename
- **Schema validation**: Validates all generated JSON against JSON Resume schema
- **Duplicate detection**: Skips existing fixtures to avoid overwriting
- **Comprehensive reporting**: Shows extracted data summary and validation status
- **Error handling**: Reports parsing failures with detailed error messages

### Notes

- The script requires the project to be built (`npm run build`) before running
- **Files are moved, not copied** - original PDFs in tests/ are removed after processing
- Only processes PDF files directly in `tests/` directory, not subdirectories
- Generated expected JSON files are automatically used by the test suite
- Schema validation warnings are shown but don't prevent fixture creation
- Existing fixtures are never overwritten - remove manually if you need to regenerate 