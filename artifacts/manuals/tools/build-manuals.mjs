import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {documents,release} from './manual-content.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const captureDir=path.join(root,'img',`live-${release.date}`);
const manifest=JSON.parse(await readFile(path.join(captureDir,'capture.json'),'utf8'));
const preview=process.argv.includes('--draft');
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allKeys=[...new Set(documents.flatMap(doc=>doc.chapters.flatMap(c=>c.shots)))];
const missing=allKeys.filter(key=>!manifest.shots[key]);
if(manifest.release.date!==release.date||manifest.release.commit!==release.commit)throw new Error('Capture release does not match manuscript');
if(missing.length&&!preview)throw new Error('Live screenshots missing: '+missing.join(', '));
for(const key of allKeys){
 const shot=manifest.shots[key];if(!shot)continue;
 if(new URL(shot.url).origin!==release.origin)throw new Error('Non-live capture: '+key);
 if(!shot.capturedAt||!shot.viewport?.width||!shot.viewport?.height)throw new Error('Capture metadata missing: '+key);
 const bytes=await readFile(path.join(captureDir,shot.file));
 if(createHash('sha256').update(bytes).digest('hex')!==shot.sha256&&!preview)throw new Error('Capture changed without metadata: '+key);
}
function figure(key,doc){
 const s=manifest.shots[key];if(!s)return `<div class="capture-pending">라이브 촬영 대기: ${esc(key)}</div>`;
 const src=path.relative(path.dirname(path.join(root,doc.file)),path.join(captureDir,s.file));
 const boxes=(s.boxes??[]).map((b,i)=>`<span class="callout" style="left:${100*b.x/s.viewport.width}%;top:${100*b.y/s.viewport.height}%;width:${100*b.width/s.viewport.width}%;height:${100*b.height/s.viewport.height}%"><b style="${b.y<20?'top:1px;':''}${b.x<20?'left:1px;':''}">${i+1}</b></span>`).join('');
 const legend=(s.boxes??[]).map((b,i)=>`<span><b>${i+1}</b> ${esc(b.label)}</span>`).join('');
 return `<figure class="${s.kind==='mobile'?'phone':'desktop'}"><div class="shot"><img src="${esc(src)}" alt="${esc(s.description||key)}" width="${s.viewport.width}" height="${s.viewport.height}">${boxes}</div>${legend?`<figcaption>${legend}</figcaption>`:''}${s.description?`<p class="shot-note">${esc(s.description)}</p>`:''}</figure>`;
}
function table(rows){return rows.length?`<table><thead><tr>${rows[0].map(cell=>`<th>${esc(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'';}
function chapter(c,index,doc){
 const shots=c.shots.map(key=>figure(key,doc)).join('');
 const steps=`<ol class="steps">${c.steps.map(text=>`<li>${esc(text)}</li>`).join('')}</ol>`;
 const notes=c.notes.length?`<aside class="notes"><h3>함께 확인하세요</h3><ul>${c.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></aside>`:'';
 return `<section class="chapter" id="${c.id}"><header class="chapter-head"><span>${doc.kind==='flow'?'따라하기':'SECTION'} ${String(index+1).padStart(2,'0')}</span><h1>${esc(c.title)}</h1></header><p class="entry"><b>들어가는 길</b> ${esc(c.path)}</p>${doc.kind==='flow'?`<div class="instruction">${steps}${notes}${table(c.rows)}</div><div class="screens">${shots}</div>`:`<div class="screens">${shots}</div><div class="guidance"><h2>사용 순서</h2>${steps}${table(c.rows)}${notes}</div>`}</section>\n`;
}
for(const doc of documents){
 const css=doc.file.startsWith('flow/')?'../style.css':'style.css';
 const body=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"><title>전기아저씨 - ${esc(doc.title)}</title></head><body>
 <section class="cover"><div class="wordmark">전기아저씨<span>사용 안내</span></div><p class="edition">LIVE EDITION · ${release.date}</p><h1>${esc(doc.title)}</h1><p class="cover-sub">${doc.kind==='flow'?'실제 화면을 보며 순서대로 진행하는 안내서':'기능별 사용 방법과 운영 기준을 확인하는 안내서'}</p><dl><div><dt>대상</dt><dd>${esc(doc.audience)}</dd></div><div><dt>접속</dt><dd>전기아저씨.com</dd></div><div><dt>버전</dt><dd>${release.version} · ${release.date} 라이브 화면</dd></div></dl><p class="cover-note">새 메뉴와 화면 배치를 기준으로 본문과 스크린샷을 다시 작성했습니다. 숫자와 목록은 촬영 시점의 예시이며 실제 이용 시 달라질 수 있습니다.</p>${preview?'<p class="draft">검토용 초안 - 미촬영 화면 포함</p>':''}</section>
 <section class="toc"><h1>목차</h1><ol>${doc.chapters.map(c=>`<li><a href="#${c.id}">${esc(c.title)}</a></li>`).join('')}</ol><div class="reading"><h2>읽는 방법</h2><p>먼저 들어가는 길을 따라 화면을 엽니다. 번호가 표시된 사진은 바로 아래 설명과 같은 위치를 가리킵니다. 입력·저장·상태 변경은 실제 처리할 대상과 내용을 확인한 뒤 진행합니다.</p><p>라이브 고객·업무 정보가 포함될 수 있으므로 내부 교육과 운영 목적으로 사용합니다. 계정의 비밀번호와 개인 인증 정보는 이 문서에 싣지 않습니다.</p></div></section>
 <main>${doc.chapters.map((c,i)=>chapter(c,i,doc)).join('')}</main><section class="closing"><h1>문의와 문서 기준</h1><p>이용 중 도움이 필요하면 포털의 문의 링크 또는 070-4995-3910으로 연락합니다.</p><p>기준: ${release.date} 라이브 배포 화면 · 버전 ${release.version}</p><p>화면의 처리 버튼은 접수·계정 상태에 따라 달라집니다. 설명과 현재 화면이 다르면 상태·조회 기간·필터·저장 여부부터 확인합니다.</p></section></body></html>`;
 await mkdir(path.dirname(path.join(root,doc.file)),{recursive:true});await writeFile(path.join(root,doc.file),body);
 console.log('HTML',doc.file);
}
await writeFile(path.join(root,'index.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><title>전기아저씨 매뉴얼 모음</title></head><body class="manual-index"><div class="wordmark">전기아저씨<span>매뉴얼 모음</span></div><h1>${release.date} 라이브 화면 개정판</h1><p>기능 기준은 운영 매뉴얼에서, 실행 순서는 따라하기에서 확인하세요.</p><ul>${documents.map(doc=>`<li><strong>${esc(doc.title)}</strong><span>${esc(doc.audience)}</span><a href="${encodeURI(doc.file)}">화면으로 읽기</a><a href="${encodeURI(doc.pdf)}">PDF 열기</a></li>`).join('')}</ul><p>라이브 캡처를 포함한 내부용 문서입니다.</p></body></html>`);
console.log('Capture coverage',allKeys.length-missing.length,'/',allKeys.length,missing.length?'Missing: '+missing.join(', '):'complete');
