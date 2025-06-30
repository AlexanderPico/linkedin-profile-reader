// New implementation: direct pdf2json parsing for spacing analysis
import PDFParser from 'pdf2json';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to decode text from pdf2json R array
function decodeText(RArray) {
  return RArray.map(r => decodeURIComponent(r.T)).join('').trim();
}

async function getPageData(pdfPath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      const items = [];
      const headrules = [];

      pdfData.Pages.forEach((page, pageIndex) => {
        // Texts
        page.Texts.forEach(t => {
          const text = decodeText(t.R);
          if (text) {
            items.push({
              text,
              x: t.x,
              y: t.y,
              page: pageIndex + 1,
            });
          }
        });

        // HLines (treat as headrules)
        if (page.HLines && page.HLines.length) {
          page.HLines.forEach((h) => {
            headrules.push({
              x: h.x,
              y: h.y,
              page: pageIndex + 1,
            });
          });
        }
      });

      resolve({ items, headrules });
    });

    pdfParser.on('pdfParser_dataError', reject);

    pdfParser.loadPDF(pdfPath);
  });
}

async function analyzeSpacing() {
  const fixtures = ['alex', 'benjamin', 'elisa', 'karamarie', 'krishna'];

  for (const fx of fixtures) {
    const pdfPath = path.join(__dirname, `tests/fixtures/${fx}/data/Profile.pdf`);
    try {
      const { items, headrules } = await getPageData(pdfPath);

      // Group items and headrules by page
      const byPage = new Map();
      const headByPage = new Map();

      items.forEach(it => {
        if (!byPage.has(it.page)) byPage.set(it.page, []);
        byPage.get(it.page).push(it);
      });

      headrules.forEach(hr => {
        if (!headByPage.has(hr.page)) headByPage.set(hr.page, []);
        headByPage.get(hr.page).push(hr);
      });

      const pages = [...byPage.keys()].sort((a, b) => a - b);

      console.log(`\n📄 ${fx.toUpperCase()}`);
      console.log('='.repeat(50));

      for (let i = 0; i < pages.length - 1; i++) {
        const pCur = pages[i];
        const pNext = pages[i + 1];
        const curItems = byPage.get(pCur).sort((a, b) => a.y - b.y);
        const nextItems = byPage.get(pNext).sort((a, b) => a.y - b.y);
        const curHead = (headByPage.get(pCur) || []).sort((a,b)=>a.y-b.y);
        const nextHead = (headByPage.get(pNext) || []).sort((a,b)=>a.y-b.y);

        // Detect the page-numbering line on the current page (item whose text is exactly "Page")
        let pageNumItem = curItems.find(it => it.text === 'Page');
        if (!pageNumItem) {
          // Fallback: take the lowest-y item on the page (footer)
          pageNumItem = curItems[curItems.length - 1];
        }
        const offset = pageNumItem.y - 2.83; // algorithm: add pageNumY then subtract 2.83

        const lastItems = curItems.slice(-10);
        const firstItemsRaw = nextItems.slice(0, 10);
        const firstItems = firstItemsRaw.map(it => ({ ...it, adjY: it.y + offset }));

        console.log(`\nPage Break ${pCur} → ${pNext}`);
        console.log('-'.repeat(30));
        console.log('End of page', pCur);
        lastItems.forEach(li => console.log(`  y=${li.y.toFixed(3)} "${li.text}"`));

        console.log('Start of page', pNext, `(adjusted by +${offset.toFixed(3)})`);
        firstItems.forEach(fi => console.log(`  y=${fi.adjY.toFixed(3)} "${fi.text}"`));

        // Print headrule y-values
        if (curHead.length) {
          console.log('  Headrules current page y:', curHead.map(h=>h.y.toFixed(3)).join(', '));
        }
        if (nextHead.length) {
          const adjHeads = nextHead.map(h=> (h.y + offset).toFixed(3));
          console.log('  Headrules next page y (adjusted):', adjHeads.join(', '));
        }

        if (lastItems.length && firstItems.length) {
          const gap = firstItems[0].adjY - lastItems[lastItems.length - 1].y;
          console.log(`Gap: ${gap.toFixed(3)} units (after adjustment)`);
        }
      }
    } catch (err) {
      console.error(`Failed processing ${fx}:`, err.message);
    }
  }
}

analyzeSpacing(); 