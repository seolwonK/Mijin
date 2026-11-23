// 붙여넣기 정리(브라우저 전용) — 네이버 블로그 편집기·발행 글에서 복사한 HTML 을 사이트 본문 형식으로 바꾼다.
//
// 네이버 스마트에디터는 본문을 "컴포넌트"(se-component) 단위로 쌓는다: 글(se-text)·소제목(se-sectionTitle)·
// 인용구(se-quotation)·구분선(se-horizontalLine)·사진(se-image)·표(se-table)·링크 카드(se-oglink).
// 이를 h2·p·blockquote·hr·figure·table 로 1:1 옮기고, 굵게·밑줄·글자색·형광펜·정렬·글자 크기는 유지한다.
// 네이버가 아닌 곳(한글·워드·다른 웹 페이지)에서 복사한 내용은 일반 규칙으로 같은 형식에 맞춘다.
// 여기는 화면 편의일 뿐이고, 저장할 때 서버가 sanitize.ts 로 다시 거른다.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');
const clean = (s: string) => s.replace(/​/g, '').replace(/ /g, ' ');

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'HR', 'PRE', 'FIGURE', 'SECTION', 'ARTICLE', 'IMG']);

type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; bg?: string; size?: number };

function normalizeColor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial') return undefined;
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return undefined;
    return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  }
  return /^#[0-9a-f]{3,8}$/.test(v) ? v : undefined;
}

// 본문 기본 글자색(검정 계열)·기본 배경(흰색)은 서식이 아니므로 버린다.
const isDefaultText = (c: string) => /^#(000000|000|111111|222222|333333|1a1a1a|2b2b2b)$/.test(c);
const isDefaultBg = (c: string) => /^#(ffffff|fff)$/.test(c);

function marksOf(el: HTMLElement, base: Marks): Marks {
  const m: Marks = { ...base };
  const tag = el.tagName;
  const st = el.style;
  if (tag === 'B' || tag === 'STRONG') m.bold = true;
  if (tag === 'I' || tag === 'EM') m.italic = true;
  if (tag === 'U') m.underline = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') m.strike = true;
  const fw = st.fontWeight;
  if (fw === 'bold' || fw === 'bolder' || Number(fw) >= 600) m.bold = true;
  else if (fw === 'normal' || (fw && Number(fw) <= 400)) m.bold = tag === 'B' || tag === 'STRONG';
  if (st.fontStyle === 'italic') m.italic = true;
  const deco = `${st.textDecoration} ${st.textDecorationLine}`;
  if (deco.includes('underline')) m.underline = true;
  if (deco.includes('line-through')) m.strike = true;
  const color = normalizeColor(st.color);
  if (color) m.color = isDefaultText(color) ? undefined : color;
  const bg = normalizeColor(st.backgroundColor);
  if (bg) m.bg = isDefaultBg(bg) ? undefined : bg;
  // 글자 크기: 네이버는 클래스(se-fs-fs24 / se-fs24), 그 밖은 인라인 px. 본문 기본(15~16px)은 서식으로 치지 않는다.
  const cls = el.className && typeof el.className === 'string' ? el.className.match(/se-fs-?(?:fs)?(\d{2})/) : null;
  const px = cls ? Number(cls[1]) : st.fontSize.endsWith('px') ? Math.round(parseFloat(st.fontSize)) : NaN;
  if (px >= 10 && px <= 40) m.size = px >= 15 && px <= 16 ? undefined : px;
  return m;
}

function wrap(text: string, m: Marks): string {
  let out = esc(text);
  const styles: string[] = [];
  if (m.color) styles.push(`color:${m.color}`);
  if (m.bg) styles.push(`background-color:${m.bg}`);
  if (m.size) styles.push(`font-size:${m.size}px`);
  if (styles.length) out = `<span style="${styles.join(';')}">${out}</span>`;
  if (m.strike) out = `<s>${out}</s>`;
  if (m.underline) out = `<u>${out}</u>`;
  if (m.italic) out = `<em>${out}</em>`;
  if (m.bold) out = `<strong>${out}</strong>`;
  return out;
}

/** 한 문단 안의 글자·링크·줄바꿈을 옮긴다. 이미지는 문단 밖 figure 로 빼기 위해 images 에 모은다. */
function inline(node: Node, marks: Marks, images: string[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = clean(node.textContent ?? '');
    return text ? wrap(text, marks) : '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === 'BR') return '<br>';
  if (tag === 'IMG') {
    const fig = figure(el as HTMLImageElement, null);
    if (fig) images.push(fig);
    return '';
  }
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON' || tag === 'SVG') return '';
  const next = marksOf(el, marks);
  const inner = [...el.childNodes].map((c) => inline(c, next, images)).join('');
  if (tag === 'A') {
    const href = el.getAttribute('href') ?? '';
    return /^(https?:|mailto:|tel:|\/)/.test(href) && inner ? `<a href="${escAttr(href)}">${inner}</a>` : inner;
  }
  return inner;
}

function alignOf(el: HTMLElement): string {
  const cls = typeof el.className === 'string' ? el.className : '';
  const fromClass = cls.match(/align-(center|right|justify)/)?.[1];
  const fromStyle = el.style.textAlign;
  const align = fromClass ?? (['center', 'right', 'justify'].includes(fromStyle) ? fromStyle : '');
  return align ? ` style="text-align:${align}"` : '';
}

/** 네이버 이미지 주소는 작은 미리보기(type=w80_blur 등)로 복사되기도 한다 — 본문용 크기로 바꾼다. */
function imageSrc(img: HTMLImageElement): string | null {
  const raw = img.getAttribute('data-lazy-src') || img.getAttribute('data-src') || img.getAttribute('src') || '';
  if (!/^(https:|data:image\/|\/api\/blog\/images\/)/.test(raw)) return null;
  // 본문 사진 서버만 크기를 바꾼다. 스티커(storep-phinf) 등은 type 값 체계가 달라 바꾸면 404 가 난다.
  if (/\/\/(postfiles|blogfiles|mblogthumb-phinf)\.pstatic\.net\//.test(raw)) return raw.replace(/([?&])type=[^&]*/, '$1type=w966');
  return raw;
}

function figure(img: HTMLImageElement, caption: string | null): string | null {
  const src = imageSrc(img);
  if (!src) return null;
  const alt = clean(img.getAttribute('alt') ?? '').trim();
  const cap = caption?.trim() ? `<figcaption>${esc(caption.trim())}</figcaption>` : '';
  return `<figure><img src="${escAttr(src)}" alt="${escAttr(alt)}">${cap}</figure>`;
}

function paragraph(el: HTMLElement, tag: 'p' | 'h2' | 'h3' | 'li' = 'p'): string[] {
  const images: string[] = [];
  const marks = tag === 'p' || tag === 'li' ? marksOf(el, {}) : {};
  let html = [...el.childNodes].map((c) => inline(c, marks, images)).join('');
  html = html.replace(/^(<br>)+|(<br>)+$/g, '');
  const out: string[] = [];
  if (html.replace(/<[^>]+>/g, '').trim()) out.push(`<${tag}${tag === 'li' ? '' : alignOf(el)}>${html}</${tag}>`);
  else if (tag === 'p' && !images.length) out.push('<p><br></p>');
  out.push(...images);
  return out;
}

function table(el: HTMLElement): string {
  const rows = [...el.querySelectorAll('tr')].map((tr) => {
    const cells = [...tr.children]
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      .map((cell) => {
        const c = cell as HTMLTableCellElement;
        const images: string[] = [];
        const parts = [...c.querySelectorAll('p')].length
          ? [...c.querySelectorAll('p')].map((p) => [...p.childNodes].map((n) => inline(n, marksOf(p as HTMLElement, {}), images)).join(''))
          : [[...c.childNodes].map((n) => inline(n, {}, images)).join('')];
        const span = `${c.colSpan > 1 ? ` colspan="${c.colSpan}"` : ''}${c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : ''}`;
        const tag = c.tagName === 'TH' ? 'th' : 'td';
        return `<${tag}${span}>${parts.filter(Boolean).join('<br>')}</${tag}>`;
      });
    return cells.length ? `<tr>${cells.join('')}</tr>` : '';
  });
  const body = rows.filter(Boolean).join('');
  return body ? `<table><tbody>${body}</tbody></table>` : '';
}

/** 네이버 컴포넌트 하나를 옮긴다. 모르는 컴포넌트는 일반 규칙으로 넘긴다. */
function naverComponent(el: HTMLElement): string[] {
  const cls = el.className;
  if (/se-documentTitle/.test(cls)) return []; // 제목은 제목 칸에 따로 넣는다
  if (/se-sectionTitle/.test(cls)) {
    return [...el.querySelectorAll<HTMLElement>('.se-text-paragraph')].flatMap((p) => paragraph(p, 'h2'));
  }
  if (/se-horizontalLine/.test(cls)) return ['<hr>'];
  if (/se-quotation/.test(cls)) {
    const images: string[] = [];
    const lines = [...el.querySelectorAll<HTMLElement>('.se-quote .se-text-paragraph, .se-quotation-container .se-text-paragraph')]
      .filter((p) => !p.closest('.se-cite'))
      .map((p) => [...p.childNodes].map((n) => inline(n, marksOf(p, {}), images)).join(''))
      .filter((h) => h.replace(/<[^>]+>/g, '').trim());
    const cite = clean(el.querySelector('.se-cite')?.textContent ?? '').trim();
    if (!lines.length) return [];
    return [`<blockquote>${lines.map((l) => `<p>${l}</p>`).join('')}${cite ? `<cite>${esc(cite)}</cite>` : ''}</blockquote>`, ...images];
  }
  if (/se-table/.test(cls)) {
    const t = el.querySelector('table');
    return t ? [table(t)].filter(Boolean) : [];
  }
  if (/se-oglink/.test(cls)) {
    const a = el.querySelector('a[href]');
    const href = a?.getAttribute('href') ?? '';
    const title = clean(el.querySelector('.se-oglink-title')?.textContent ?? a?.textContent ?? href).trim();
    return /^https?:/.test(href) ? [`<p><a href="${escAttr(href)}">${esc(title || href)}</a></p>`] : [];
  }
  if (/se-(image|imageStrip|imageGroup|sticker)/.test(cls)) {
    const caption = clean(el.querySelector('.se-caption')?.textContent ?? '');
    const imgs = [...el.querySelectorAll('img')];
    return imgs.map((img, i) => figure(img, i === imgs.length - 1 ? caption : null)).filter((f): f is string => !!f);
  }
  if (/se-code/.test(cls)) {
    const code = el.querySelector('.se-code-source')?.textContent ?? el.textContent ?? '';
    return code.trim() ? [`<pre>${esc(code)}</pre>`] : [];
  }
  if (/se-text/.test(cls)) {
    const out: string[] = [];
    const walk = (node: Element) => {
      for (const child of [...node.children] as HTMLElement[]) {
        if (child.matches('ul, ol')) out.push(list(child));
        else if (child.matches('p')) out.push(...paragraph(child));
        else walk(child);
      }
    };
    walk(el);
    return out;
  }
  return blocks(el);
}

function list(el: HTMLElement): string {
  const tag = el.tagName === 'OL' ? 'ol' : 'ul';
  const items = [...el.children]
    .filter((c) => c.tagName === 'LI')
    .map((li) => {
      const ps = [...li.querySelectorAll<HTMLElement>(':scope > p, :scope > div > p')];
      const src = ps.length ? ps : [li as HTMLElement];
      const images: string[] = [];
      const html = src.map((p) => [...p.childNodes].filter((n) => !(n instanceof HTMLElement && (n.tagName === 'UL' || n.tagName === 'OL'))).map((n) => inline(n, marksOf(p, {}), images)).join('')).join('<br>');
      return html.replace(/<[^>]+>/g, '').trim() ? `<li>${html}</li>` : '';
    })
    .filter(Boolean);
  return items.length ? `<${tag}>${items.join('')}</${tag}>` : '';
}

const hasBlockChild = (el: Element) => [...el.children].some((c) => BLOCK_TAGS.has(c.tagName) || c.querySelector('p, div, table, ul, ol, h1, h2, h3, h4, blockquote, img, hr'));

/** 일반 규칙 — 블록 요소를 순서대로 옮긴다. */
function blocks(root: Element): string[] {
  const out: string[] = [];
  let loose: Node[] = [];
  const flush = () => {
    if (!loose.length) return;
    // 반드시 붙여넣기 문서(DOMParser 가 만든 비활성 문서) 안에서 만든다. 현재 화면의 document 로 만들면
    // 복사해 온 노드가 화면 문서로 입양되면서 <img onerror> 같은 속성이 실행된다(관리자 화면 DOM XSS).
    const holder = root.ownerDocument.createElement('p');
    loose.forEach((n) => holder.appendChild(n.cloneNode(true)));
    loose = [];
    const made = paragraph(holder);
    if (made.join('') !== '<p><br></p>') out.push(...made);
  };
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (clean(node.textContent ?? '').trim()) loose.push(node);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK' || tag === 'BUTTON') continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    // 제목 영역(제목·블로그 프로필 사진·작성일)은 본문이 아니다 — 제목만 제목 칸으로 따로 옮긴다.
    if (/se-documentTitle/.test(cls)) continue;
    if (/(^|\s)se-component(\s|$)/.test(cls)) { flush(); out.push(...naverComponent(el)); continue; }
    if (!BLOCK_TAGS.has(tag)) { loose.push(el); continue; }
    flush();
    if (tag === 'H1' || tag === 'H2') out.push(...paragraph(el, 'h2'));
    else if (tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') out.push(...paragraph(el, 'h3'));
    else if (tag === 'UL' || tag === 'OL') out.push(list(el));
    else if (tag === 'HR') out.push('<hr>');
    else if (tag === 'TABLE') out.push(table(el));
    else if (tag === 'PRE') out.push(`<pre>${esc(el.textContent ?? '')}</pre>`);
    else if (tag === 'IMG') { const f = figure(el as HTMLImageElement, null); if (f) out.push(f); }
    else if (tag === 'FIGURE') {
      const cap = clean(el.querySelector('figcaption')?.textContent ?? '');
      const imgs = [...el.querySelectorAll('img')];
      out.push(...imgs.map((img, i) => figure(img, i === imgs.length - 1 ? cap : null)).filter((f): f is string => !!f));
    } else if (tag === 'BLOCKQUOTE') {
      const inner = hasBlockChild(el) ? blocks(el) : paragraph(el);
      const body = inner.filter((h) => h !== '<p><br></p>').join('');
      if (body) out.push(`<blockquote>${body}</blockquote>`);
    } else if (hasBlockChild(el)) out.push(...blocks(el));
    else out.push(...paragraph(el));
  }
  flush();
  return out.filter(Boolean);
}

/** 빈 줄은 연달아 하나만 남기고, 맨 앞·맨 뒤 빈 줄은 지운다. */
function tidy(parts: string[]): string {
  const EMPTY = '<p><br></p>';
  const out: string[] = [];
  for (const p of parts) {
    if (p === EMPTY && (out.length === 0 || out[out.length - 1] === EMPTY)) continue;
    out.push(p);
  }
  while (out[out.length - 1] === EMPTY) out.pop();
  return out.join('\n');
}

export type PasteResult = { html: string; title: string | null };

/** 클립보드 HTML → 본문 HTML. 네이버 글 전체를 복사했다면 제목도 함께 돌려준다. */
export function normalizePastedHtml(rawHtml: string): PasteResult {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const titleEl = doc.querySelector('.se-documentTitle .se-title-text, .se-documentTitle .se-text-paragraph');
  const title = titleEl ? clean(titleEl.textContent ?? '').trim() || null : null;
  return { html: tidy(blocks(doc.body)), title };
}

/** 서식 없는 글(메모장 등) → 문단. 빈 줄은 문단 사이 간격으로 남긴다. */
export function normalizePastedText(text: string): string {
  return tidy(text.replace(/\r\n?/g, '\n').split('\n').map((line) => (line.trim() ? `<p>${esc(line)}</p>` : '<p><br></p>')));
}
