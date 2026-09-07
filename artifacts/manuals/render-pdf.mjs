// HTML 매뉴얼 → A4 PDF (Chromium 인쇄)
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const docs = [
  ['업체-매뉴얼.html', '전기아저씨-업체-매뉴얼.pdf', '업체 포털 사용 매뉴얼'],
  ['기사-매뉴얼.html', '전기아저씨-기사-매뉴얼.pdf', '전기기사 포털 사용 매뉴얼'],
  ['관리자-매뉴얼.html', '전기아저씨-관리자-매뉴얼.pdf', '관리자 페이지 운영 매뉴얼'],
  ['배정로직-상세.html', '전기아저씨-배정로직-상세.pdf', '배정 로직 상세 문서'],
  ['flow/고객-따라하기.html', 'flow/전기아저씨-고객-따라하기.pdf', '고객 따라하기 — 접수 플로우'],
  ['flow/업체-따라하기.html', 'flow/전기아저씨-업체-따라하기.pdf', '업체 따라하기 — 포털 플로우'],
  ['flow/기사-따라하기.html', 'flow/전기아저씨-기사-따라하기.pdf', '기사 따라하기 — 포털 플로우'],
  ['flow/관리자-따라하기.html', 'flow/전기아저씨-관리자-따라하기.pdf', '관리자 따라하기 — 전 기능 플로우'],
];

const b = await chromium.launch();
const p = await b.newPage();
for (const [src, out, title] of docs) {
  await p.goto('file://' + path.join(dir, src), { waitUntil: 'networkidle' });
  await p.pdf({
    path: path.join(dir, out),
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '15mm', left: '13mm', right: '13mm' },
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-size:7.5px;color:#8a94ab;padding:0 13mm;display:flex;justify-content:space-between;font-family:'Apple SD Gothic Neo',sans-serif;"><span>전기아저씨 — ${title}</span><span>v2026-08-31 · 내부용</span></div>`,
    footerTemplate: `<div style="width:100%;font-size:7.5px;color:#8a94ab;padding:0 13mm;display:flex;justify-content:space-between;font-family:'Apple SD Gothic Neo',sans-serif;"><span>© 2026 전기아저씨</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log('완료:', out);
}
await b.close();
