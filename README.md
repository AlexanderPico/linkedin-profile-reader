# LinkedIn-Profile-Reader

Parse the PDF résumé exported by LinkedIn (`Profile.pdf`) and return structured JSON – currently focused on the **Experience** section.

```sh
npm install linkedin-profile-reader
```

## CLI usage

```sh
# From a file
parse-linkedin-pdf ./Profile.pdf > experience.json

# Or via stdin
cat Profile.pdf | parse-linkedin-pdf > experience.json
```

## Library usage

```ts
import { parseLinkedInPdf } from 'linkedin-profile-reader';

const { positions } = await parseLinkedInPdf('/path/to/Profile.pdf');
```

```ts
interface ExperiencePosition {
  title: string;
  company: string;
  location: string;
  start: string;        // e.g. "Mar 2021"
  end: string | null;   // null when "Present"
  summary: string;      // reserved for future
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
* Education, Skills, and other sections parsing
* Smarter heuristics / machine-learning rules

## License

MIT © 2024 Your Name
