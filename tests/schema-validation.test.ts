import { parseLinkedInPdf } from '../dist/index.js';

describe('JSON Resume Schema Validation', () => {
  const testProfiles = [
    { name: 'alex', path: './tests/fixtures/alex/data/Profile.pdf' },
    { name: 'krishna', path: './tests/fixtures/krishna/data/Profile.pdf' },
    { name: 'elisa', path: './tests/fixtures/elisa/data/Profile.pdf' },
    { name: 'benjamin', path: './tests/fixtures/benjamin/data/Profile.pdf' },
  ];

  test.each(testProfiles)(
    '$name profile should be valid against JSON Resume schema',
    async ({ name, path: profilePath }) => {
      const result = await parseLinkedInPdf(profilePath);

      // Dynamic import to avoid TypeScript issues with AJV
      const { validateJSONResume } = await import('../src/validate.mjs');
      const validation = validateJSONResume(result) as {
        valid: boolean;
        errors?: string[];
      };

      if (!validation.valid) {
        console.log(`\n${name.toUpperCase()} Schema Validation Errors:`);
        validation.errors?.forEach((error: string) => {
          console.log(`  - ${error}`);
        });
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
