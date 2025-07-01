import { parseLinkedInPdf } from './dist/index.js';
import fs from 'fs';

async function debugHighlights() {
  try {
    const pdfPath = 'tests/fixtures/anna-marie/data/Profile.pdf';
    const result = await parseLinkedInPdf(pdfPath);
    
    console.log('\n=== HIGHLIGHT LINES WITH Y VALUES ===\n');
    
    result.work.forEach((work, workIndex) => {
      console.log(`\n--- ${work.name} (${work.position}) ---`);
      
      if (work.highlights) {
        work.highlights.forEach((highlight, highlightIndex) => {
          console.log(`Highlight ${highlightIndex + 1}:`);
          console.log(`  "${highlight}"`);
          console.log('');
        });
      } else {
        console.log('No highlights found');
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugHighlights(); 