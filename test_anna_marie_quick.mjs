import { parseLinkedInPdf } from './dist/index.js';

console.log('=== ANNA-MARIE QUICK TEST ===');

const result = await parseLinkedInPdf('tests/fixtures/anna-marie/data/Profile.pdf');

console.log('Current highlights for first work entry:');
if (result.work[0]?.highlights) {
  result.work[0].highlights.forEach((highlight, i) => {
    console.log(`[${i}]: "${highlight}"`);
  });
}

console.log(`\nTotal highlights: ${result.work[0]?.highlights?.length || 0}`);
console.log('Expected: 7 highlights');

// Check for the specific fixes
const highlights = result.work[0]?.highlights || [];
const includingHighlight = highlights.find(h => h.includes('including:'));
const changeHighlight = highlights.find(h => h.includes('inspire change'));

console.log('\n=== SPECIFIC CHECKS ===');
if (includingHighlight) {
  console.log('✓ Found "including:" highlight');
  console.log(`  Contains "Gladstone's leadership": ${includingHighlight.includes("Gladstone's leadership")}`);
  console.log(`  Ends with period: ${includingHighlight.endsWith('.')}`);
}

if (changeHighlight) {
  console.log('✓ Found "inspire change" highlight');
  console.log(`  Contains "I'm proud": ${changeHighlight.includes("I'm proud")}`);
  console.log(`  Ends with period: ${changeHighlight.endsWith('.')}`);
} 