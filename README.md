# LinkedIn-Profile-Reader

Parse the PDF résumé exported by LinkedIn (`Profile.pdf`) and return structured JSON that follows the open-source [JSON Resume](https://jsonresume.org/) schema – currently populating the **basics**, **work**, and **education** arrays.

**🎯 Recent Major Improvements (v0.3.0):**
- **Fixed truncated content**: Work section now properly extends until Education section (no more arbitrary limits)
- **Enhanced parsing accuracy**: Better column detection, location recognition, and content filtering
- **Improved data structure**: Workshop titles, data types, and technical content now properly separated into individual highlights
- **Better location detection**: Support for major cities worldwide (Bangalore, Mumbai, etc.)
- **Healthcare content recognition**: Medical terminology no longer incorrectly filtered out

Currently extracts the LinkedIn Basics, Experience and Education sections into JSON Resume `basics`, `work` and `education` arrays.

## CLI usage

```sh
# From a file
parse-linkedin-pdf ./Profile.pdf > profile.json

# Or via stdin
cat Profile.pdf | parse-linkedin-pdf > profile.json
```

## Library usage

```ts
import { parseLinkedInPdf } from 'linkedin-profile-reader';

const { basics, work, education } = await parseLinkedInPdf('/path/to/Profile.pdf');
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
```

## Key Features

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
```

Pre-commit hooks format & lint staged files (husky + lint-staged).

## Roadmap
* Skills, Certifications, and other sections parsing
* Smarter heuristics / machine-learning rules
* See [docs/roadmap.md](docs/roadmap.md) for detailed progress

## License

MIT © 2025 Alexander Pico