# LinkedIn-Profile-Reader

Parse the PDF résumé exported by LinkedIn (`Profile.pdf`) and return structured JSON that follows the open-source [JSON Resume](https://jsonresume.org/) schema – currently populating the **basics**, **work**, **education**, **skills**, **certificates**, and **languages** arrays.

**🎯 Recent Major Improvements (v0.3.0):**
- **JSON Resume Schema Compliance**: Output now fully validates against JSON Resume schema with proper date formats (ISO8601) and null handling
- **Schema Validation**: CLI `--validate` flag and programmatic validation function for quality assurance
- **Fixed truncated content**: Work section now properly extends until Education section (no more arbitrary limits)
- **Enhanced parsing accuracy**: Better column detection, location recognition, and content filtering
- **Skills extraction**: Now parses Skills/Top Skills section from left column
- **Certificates extraction**: Parses certificates and certifications from left column
- **Languages extraction**: Parses languages with fluency levels from left column
- **Improved data structure**: Workshop titles, data types, and technical content now properly separated into individual highlights
- **Better location detection**: Support for major cities worldwide (Bangalore, Mumbai, etc.)
- **Healthcare content recognition**: Medical terminology no longer incorrectly filtered out

Currently extracts the LinkedIn Basics, Experience, Education, Skills, Certificates, and Languages sections into JSON Resume `basics`, `work`, `education`, `skills`, `certificates`, and `languages` arrays.

## CLI usage

```sh
# From a file
parse-linkedin-pdf ./Profile.pdf > profile.json

# With schema validation
parse-linkedin-pdf --validate ./Profile.pdf > profile.json

# Or via stdin
cat Profile.pdf | parse-linkedin-pdf --validate > profile.json

# Get help
parse-linkedin-pdf --help
```

## Library usage

```ts
import { parseLinkedInPdf } from 'linkedin-profile-reader';

const { basics, work, education, skills, certificates, languages } = await parseLinkedInPdf('/path/to/Profile.pdf');
```

```ts
interface JSONResumeWork {
  name: string;        // Company name
  position: string;    // Job title
  location?: string;   // Work location (enhanced detection)
  startDate?: string | null; // YYYY or YYYY-MM
  endDate?: string | null;   // null when "Present"
  summary?: string;
  url?: string;        // Company website (auto-detected)
  highlights?: string[]; // Job responsibilities (improved parsing)
}

interface JSONResumeEducation {
  institution: string;
  studyType?: string;  // Degree type
  area?: string;       // Field of study
  startDate?: string | null;
  endDate?: string | null;
}

interface JSONResumeBasics {
  name?: string;
  label?: string;      // Professional title
  email?: string;
  phone?: string;
  url?: string;
  location?: JSONResumeLocation;
  summary?: string;    // Professional summary
}

interface JSONResumeSkill {
  name: string;        // Skill name (e.g., "Python", "Data Analysis")
  level?: string;      // Skill level (future enhancement)
  keywords?: string[]; // Related keywords (future enhancement)
}

interface JSONResumeCertificate {
  name: string;        // Certificate name
  issuer?: string;     // Issuing organization (future enhancement)
  date?: string;       // Issue date (future enhancement)
  url?: string;        // Certificate URL (future enhancement)
}

interface JSONResumeLanguage {
  language: string;    // Language name (e.g., "English", "Spanish")
  fluency?: string;    // Fluency level (e.g., "Native or Bilingual", "Professional")
}
```

## Key Features

- **Schema compliant**: Output validates against official JSON Resume schema
- **Built-in validation**: CLI `--validate` flag ensures output quality
- **Accurate parsing**: Enhanced column detection and content filtering
- **Structured highlights**: Job responsibilities properly separated (no more massive single lines)
- **Location detection**: Recognizes major cities and complex address formats
- **Cross-page content**: Handles content spanning multiple PDF pages
- **Automatic text formatting**: Proper capitalization and clean text output
- **TypeScript support**: Full type definitions included

## API docs
Run `npm run docs` or browse the generated HTML in `docs/`.

## Development

```sh
npm install          # install deps
npm test             # run Jest test-suite
npm run lint         # eslint + prettier
npm run build        # emit dist/ ESM build
npm run fixtures     # generate test fixtures from PDFs
```

Pre-commit hooks format & lint staged files (husky + lint-staged).

### Adding Test Fixtures

To add new test cases:

1. Place Profile.pdf files directly in the `tests/` directory (e.g., `tests/Profile.pdf`)
2. Run `npm run fixtures` to automatically create fixture directories and expected JSON
3. Run `npm test` to verify the new fixtures pass

The fixture generator will automatically:
- Parse PDFs to extract profile names and create meaningful fixture names (e.g., "John Doe" → `john`)
- Move PDFs to proper directory structure (`tests/fixtures/{firstname}/data/Profile.pdf`)
- Generate expected JSON files with schema validation
- Handle name conflicts with last initials or numerical suffixes

## Roadmap
* ✅ **JSON Resume Schema Validation**: Output now fully complies with JSON Resume schema
* Enhanced certificate parsing (issuer, dates, URLs)
* Enhanced language parsing (proficiency levels)
* Publications, Projects, and other sections parsing
* Smarter heuristics / machine-learning rules
* See [docs/roadmap.md](docs/roadmap.md) for detailed progress

## License

MIT © 2025 Alexander Pico