import PDFParser from 'pdf2json';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function decodeText(RArray){return RArray.map(r=>decodeURIComponent(r.T)).join('').trim();}

function loadPdfItems(pdfPath){return new Promise((resolve,reject)=>{const parser=new PDFParser();parser.on('pdfParser_dataReady',data=>{const items=[];const head=[];data.Pages.forEach((p,i)=>{p.Texts.forEach(t=>{const text=decodeText(t.R);if(text){items.push({text,x:t.x,y:t.y,page:i+1});}});(p.HLines||[]).forEach(h=>{head.push({x:h.x,y:h.y,page:i+1});});});resolve({items,head});});parser.on('pdfParser_dataError',reject);parser.loadPDF(pdfPath);});}

function normalize(items,head){const pageNumberItems=[];for(let i=0;i<items.length-3;i++){const cur=items[i],n1=items[i+1],n2=items[i+2],n3=items[i+3];if(cur.text==='Page'&&n1.text.match(/^\d+$/)&&n2.text==='of'&&n3.text.match(/^\d+$/)){pageNumberItems.push(cur,n1,n2,n3);} }
const filtered=items.filter(it=>!pageNumberItems.includes(it));
const footerY={};pageNumberItems.forEach(it=>{if(it.text==='Page')footerY[it.page]=it.y;});
const pages=[...new Set(filtered.map(i=>i.page))].sort((a,b)=>a-b);
const offsets={};let cum=0;for(let i=0;i<pages.length-1;i++){const curPage=pages[i],next=pages[i+1];const footer=footerY[curPage]??47.883;const off=footer-2.83;cum+=off;offsets[next]=cum;}
return filtered.map(it=>({...it,y:it.y+(offsets[it.page]||0)})).sort((a,b)=>a.y-b.y);
}

(async()=>{
 const pdf=path.join(__dirname,'tests/fixtures/karamarie/data/Profile.pdf');
 const {items,head}=await loadPdfItems(pdf);
 const norm=normalize(items,head);
 norm.forEach(it=>console.log(`page${it.page} y=${it.y.toFixed(3)} ${it.text}`));
})(); 