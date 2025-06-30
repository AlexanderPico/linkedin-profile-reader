import { parseLinkedInPdf } from './dist/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testNegativeSpacing() {
  const fixtures = ['alex', 'benjamin', 'elisa', 'karamarie', 'krishna'];
  
  console.log('🧪 Testing -3 Unit Page Spacing');
  console.log('=' .repeat(50));
  console.log('Checking if this eliminates need for special headrule handling...\n');
  
  for (const fixture of fixtures) {
    try {
      const pdfPath = path.join(__dirname, `tests/fixtures/${fixture}/data/Profile.pdf`);
      console.log(`🔍 ${fixture}:`);
      
      await parseLinkedInPdf(pdfPath);
      
    } catch (error) {
      console.log(`❌ ${fixture}: Error - ${error.message}`);
    }
  }
}

testNegativeSpacing().catch(console.error); 