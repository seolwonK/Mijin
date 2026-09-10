// HTML 매뉴얼 → A4 PDF (Chromium 인쇄)
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { documents, release } from './tools/manual-content.mjs';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
try {
const p = await b.newPage();
for (const {file:src, pdf:out, title} of documents) {
  await p.goto(pathToFileURL(path.join(dir, src)).href, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const problems = await p.evaluate(() => ({
    pending: document.querySelectorAll('.draft, .capture-pending').length,
    missing: [...document.images].filter(img => !img.complete || !img.naturalWidth).map(img => img.getAttribute('src')),
  }));
  if (problems.pending || problems.missing.length) {
    throw new Error(`${src}: 미완성 원고 또는 이미지 누락 ${JSON.stringify(problems)}`);
  }
  await p.pdf({
    path: path.join(dir, out),
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '15mm', left: '13mm', right: '13mm' },
    displayHeaderFooter: true,
    tagged: true,
    outline: true,
    headerTemplate: `<div style="width:100%;font-size:7.5px;color:#687369;padding:0 13mm;display:flex;justify-content:space-between;font-family:'Apple SD Gothic Neo',sans-serif;"><span>전기아저씨 - ${title}</span><span>v${release.version} · ${release.date} · 내부용</span></div>`,
    footerTemplate: `<div style="width:100%;font-size:7.5px;color:#8a94ab;padding:0 13mm;display:flex;justify-content:space-between;font-family:'Apple SD Gothic Neo',sans-serif;"><span>© 2026 전기아저씨</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log('완료:', out);
}
} finally {
  await b.close();
}
