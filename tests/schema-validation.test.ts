import { parseLinkedInPdf } from '../src/index.js';
import { validateJSONResume } from '../src/validate.mjs';
import fs from 'fs';
import path from 'path';
// import type { JSONResumeWork, JSONResumeEducation } from '../src/types.d.ts';

describe('JSON Resume Schema Validation', () => {
  // Dynamically discover all fixture profiles
  const FIXTURES_DIR = path.resolve('tests/fixtures');
  const fixtures = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory());

  const testProfiles = fixtures.map((name) => ({
    name,
    path: `./tests/fixtures/${name}/data/Profile.pdf`,
  }));

  test.each(testProfiles)(
    '$name profile should be valid against JSON Resume schema',
    async ({ name, path: profilePath }) => {
      const result = await parseLinkedInPdf(profilePath);

      const validation = validateJSONResume(result) as {
        valid: boolean;
        errors?: string[];
      };

      if (!validation.valid) {
        console.log(`\n${name.toUpperCase()} Schema Validation Errors:`);
        validation.errors?.forEach((error: string) => {
          console.log(`  - ${error}`);
        });
        // Print the full result for debugging
        console.log('Full result:', JSON.stringify(result, null, 2));
        fail('Schema validation failed. See errors above.');
      }

      expect(validation.valid).toBe(true);

      // At minimum, ensure the result has the required structure
      expect(result).toHaveProperty('work');
      expect(result).toHaveProperty('education');
      expect(Array.isArray(result.work)).toBe(true);
      expect(Array.isArray(result.education)).toBe(true);
    },
  );

  test('should include $schema reference', async () => {
    const result = await parseLinkedInPdf(
      './tests/fixtures/alex/data/Profile.pdf',
    );
    expect(result.$schema).toBe(
      'https://jsonresume.org/schema/1.0.0/resume.json',
    );
  });

  test('should have proper array types for optional sections', async () => {
    const result = await parseLinkedInPdf(
      './tests/fixtures/alex/data/Profile.pdf',
    );

    if (result.skills) {
      expect(Array.isArray(result.skills)).toBe(true);
    }
    if (result.certificates) {
      expect(Array.isArray(result.certificates)).toBe(true);
    }
    if (result.languages) {
      expect(Array.isArray(result.languages)).toBe(true);
    }
    if (result.awards) {
      expect(Array.isArray(result.awards)).toBe(true);
    }
  });

  test('should have proper date formats (ISO8601)', async () => {
    const result = await parseLinkedInPdf(
      './tests/fixtures/alex/data/Profile.pdf',
    );

    // Check work dates
    result.work.forEach((work) => {
      if (work.startDate) {
        expect(work.startDate).toMatch(/^\d{4}(-\d{2})?(-\d{2})?$/);
      }
      if (work.endDate) {
        expect(work.endDate).toMatch(/^\d{4}(-\d{2})?(-\d{2})?$/);
      }
    });

    // Check education dates
    result.education.forEach((edu) => {
      if (edu.startDate) {
        expect(edu.startDate).toMatch(/^\d{4}(-\d{2})?(-\d{2})?$/);
      }
      if (edu.endDate) {
        expect(edu.endDate).toMatch(/^\d{4}(-\d{2})?(-\d{2})?$/);
      }
    });
  });

  test('should not use null for optional date fields', async () => {
    const result = await parseLinkedInPdf(
      './tests/fixtures/alex/data/Profile.pdf',
    );

    // Check that endDate is undefined (not null) for current positions
    result.work.forEach((work) => {
      if (work.endDate === null) {
        fail(`Work entry "${work.name}" has null endDate, should be undefined`);
      }
    });

    result.education.forEach((edu) => {
      if (edu.endDate === null) {
        fail(
          `Education entry "${edu.institution}" has null endDate, should be undefined`,
        );
      }
    });
  });
});