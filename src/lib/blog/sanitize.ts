import sanitizeHtml from 'sanitize-html';

// 블로그 본문 HTML 정화 — 저장 직전에 서버에서 한 번 더 거른다.
// 편집기(BlogEditor)가 붙여넣기를 이미 정리하지만, 그건 화면 편의일 뿐 신뢰 경계가 아니다.
// 허용 목록 밖의 태그·속성·스타일은 버린다(스크립트·이벤트 속성·iframe 포함).

export const BLOG_IMAGE_PATH = '/api/blog/images/';
const OWN_IMAGE = /^\/api\/blog\/images\/[a-z0-9]+$/i;

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i];
const ALIGN = [/^(left|center|right|justify)$/];
const FONT_SIZE = [/^(1[0-9]|2[0-9]|3[0-9]|40)px$/];

const BLOCK_STYLE = { 'text-align': ALIGN };
const INLINE_STYLE = { color: COLOR, 'background-color': COLOR, 'font-size': FONT_SIZE };

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'p', 'br', 'hr', 'strong', 'em', 'u', 's', 'span', 'a', 'blockquote', 'cite',
    'ul', 'ol', 'li', 'figure', 'figcaption', 'img', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    span: ['style'],
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
    figure: ['style'],
    blockquote: ['style'],
    th: ['colspan', 'rowspan', 'style'],
    td: ['colspan', 'rowspan', 'style'],
  },
  allowedStyles: {
    span: INLINE_STYLE,
    p: BLOCK_STYLE,
    h2: BLOCK_STYLE,
    h3: BLOCK_STYLE,
    figure: BLOCK_STYLE,
    blockquote: BLOCK_STYLE,
    th: BLOCK_STYLE,
    td: BLOCK_STYLE,
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    // 외부 링크는 새 창으로 열고 원래 창 접근을 끊는다. 사이트 안 링크(/…)는 그대로 둔다.
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const internal = /^(\/(?!\/)|#|\?)/.test(href);
      const out: Record<string, string> = internal ? { href } : { href, target: '_blank', rel: 'noopener noreferrer' };
      return { tagName, attribs: out };
    },
    // 이미지 주소는 우리 저장소 경로이거나 https 외부 주소만. 사이트 안 다른 경로(/admin, /api/…)를 img 로 호출하게 두지 않는다.
    img: (tagName, attribs) => {
      const src = attribs.src ?? '';
      const ok = OWN_IMAGE.test(src) || src.startsWith('https://');
      const out: Record<string, string> = ok ? { ...attribs, loading: 'lazy' } : { alt: attribs.alt ?? '' };
      return { tagName, attribs: out };
    },
  },
  exclusiveFilter: (frame) =>
    // 빈 링크·빈 강조 태그는 지운다(붙여넣기 잔재).
    ['a', 'strong', 'em', 'u', 's', 'span'].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren.length,
};

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** 본문에서 글자만 뽑는다 — 요약 자동 생성·빈 본문 판정용. */
export function blogPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&') // 맨 마지막 — 먼저 풀면 글자 그대로 쓴 "&lt;" 가 "<" 로 바뀐다
    .replace(/[​\s]+/g, ' ')
    .trim();
}

/** 검색 결과 설명 — 문장 경계에서 끊어 maxLength 이내로 만든다. */
export function summarize(text: string, maxLength = 150): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('요. '), cut.lastIndexOf('다. '));
  return end > maxLength * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : maxLength)}…`;
}

/** 본문 첫 이미지 경로. */
export function firstImage(html: string): string | null {
  return html.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ?? null;
}

/** 아직 사이트로 옮기지 못한 외부 이미지 주소 목록 — 발행 전에 알려 주려는 용도. */
export function externalImages(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((src) => !OWN_IMAGE.test(src));
}

/** 본문이 쓰는 우리 저장소 이미지 ID 목록. */
export function ownImageIds(html: string): string[] {
  return [...new Set([...html.matchAll(/\/api\/blog\/images\/([a-z0-9]+)/gi)].map((m) => m[1]))];
}

/**
 * 주소(slug) 정리 — 한글·영문·숫자만 남기고 나머지는 하이픈으로. 한글 주소는 검색엔진이 그대로 읽는다.
 * 결과가 비면 null(호출부가 대체 값을 만든다).
 */
export function slugify(input: string): string | null {
  const slug = input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || null;
}
