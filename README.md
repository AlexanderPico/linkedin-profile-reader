# LinkedIn-Profile-Reader

Parse the PDF résumé exported by LinkedIn (`Profile.pdf`) and return structured JSON that follows the open-source [JSON Resume](https://jsonresume.org/) schema – currently populating the **work** and **education** arrays.

Currently extracts the LinkedIn Experience and Education sections into JSON Resume `work` and `education` arrays.

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

const { work, education } = await parseLinkedInPdf('/path/to/Profile.pdf');
```

```ts
interface JSONResumeWork {
  name: string;
  position: string;
  location?: string;
  startDate?: string | null; // YYYY or YYYY-MM
  endDate?: string | null;   // null when "Present"
  summary?: string;
}

interface JSONResumeEducation {
  institution: string;
  studyType?: string;
  area?: string;
  startDate?: string | null;
  endDate?: string | null;
}
```

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

## License

MIT © 2025 Alexander Pico