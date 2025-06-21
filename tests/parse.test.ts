import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from '@jest/globals';
import { parseLinkedInPdf } from '../src/index.ts';

const FIXTURES_DIR = path.resolve('tests/fixtures');

const fixtures = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory());

describe('parseLinkedInPdf', () => {
  it('parses all fixture PDFs and matches expected JSON', async () => {
    expect(fixtures.length).toBeGreaterThan(0);

    for (const name of fixtures) {
      const cwd = path.join(FIXTURES_DIR, name);
      const pdfPath = path.join(cwd, 'data', 'Profile.pdf');
      expect(fs.existsSync(pdfPath)).toBe(true);

      const result = await parseLinkedInPdf(pdfPath);
      expect(Array.isArray(result.work) && result.work.length).toBeTruthy();

      const expectedPath = path.join(cwd, 'data', 'Profile.expected.json');
      if (fs.existsSync(expectedPath)) {
        const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));
        expect(result.work).toEqual(expected.work);
        expect(result.education).toEqual(expected.education);
      }
    }
  }, 60_000); // allow ample time for PDF parsing
});
