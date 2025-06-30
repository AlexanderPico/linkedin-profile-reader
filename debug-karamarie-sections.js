import { parseLinkedInPdf } from './dist/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugKaramarieSections() {
  console.log('🔍 Debugging Karamarie Section Detection');
  console.log('=' .repeat(50));
  
  const pdfPath = path.join(__dirname, 'tests/fixtures/karamarie/data/Profile.pdf');
  
  // Enable debugging
  process.env.DEBUG = 'sections';
  
  try {
    const profile = await parseLinkedInPdf(pdfPath);
    console.log(`\n📊 Result: ${profile.experience.length} work entries, ${profile.education.length} education entries`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

debugKaramarieSections().catch(console.error); 