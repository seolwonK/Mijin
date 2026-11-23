import { describe, expect, it } from 'vitest';
import { blogPlainText, externalImages, firstImage, sanitizeBlogHtml, slugify, summarize } from '@/lib/blog/sanitize';
import { isImportableImageUrl, sniffImageMime } from '@/lib/blog/images';

describe('블로그 본문 정화', () => {
  it('스크립트·이벤트 속성·iframe 을 버린다', () => {
    const out = sanitizeBlogHtml('<p onclick="x()">안녕<script>alert(1)</script></p><iframe src="https://a.b"></iframe><img src="https://a.b/c.png" onerror="x()">');
    expect(out).not.toMatch(/script|onclick|onerror|iframe/);
    expect(out).toContain('<p>안녕</p>');
  });

  it('javascript: 링크와 http 이미지를 버린다', () => {
    const out = sanitizeBlogHtml('<p><a href="javascript:alert(1)">링크</a></p><img src="http://a.b/c.png"><img src="data:image/png;base64,AAAA">');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('http://a.b');
    expect(out).not.toContain('data:');
  });

  it('네이버에서 넘어온 서식(소제목·인용구·표·글자색·정렬)을 유지한다', () => {
    const html =
      '<h2 style="text-align:center">소제목</h2><p><strong>굵게</strong> <span style="color:#ff0010;background-color:#fff8b2;font-size:19px">강조</span></p>' +
      '<blockquote><p>인용</p><cite>출처</cite></blockquote><hr><table><tbody><tr><td colspan="2">칸</td></tr></tbody></table>' +
      '<figure><img src="/api/blog/images/abc" alt="사진"><figcaption>설명</figcaption></figure>';
    const out = sanitizeBlogHtml(html);
    expect(out).toContain('<h2 style="text-align:center">소제목</h2>');
    expect(out).toContain('color:#ff0010');
    expect(out).toContain('background-color:#fff8b2');
    expect(out).toContain('font-size:19px');
    expect(out).toContain('<cite>출처</cite>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('src="/api/blog/images/abc"');
    expect(out).toContain('<figcaption>설명</figcaption>');
  });

  it('허용하지 않는 스타일(position·url)을 버린다', () => {
    const out = sanitizeBlogHtml('<span style="position:fixed;color:red;background-color:url(x)">글</span>');
    expect(out).not.toMatch(/position|url\(/);
  });

  it('외부 링크는 새 창 + noopener, 사이트 안 링크는 그대로', () => {
    expect(sanitizeBlogHtml('<a href="https://example.com">밖</a>')).toContain('rel="noopener noreferrer"');
    expect(sanitizeBlogHtml('<a href="/request/new">안</a>')).toBe('<a href="/request/new">안</a>');
  });

  it('본문 글자·요약·첫 이미지·외부 이미지', () => {
    const html = '<p>첫 문장입니다. 둘째 문장입니다.</p><figure><img src="https://postfiles.pstatic.net/a.jpg" alt=""></figure><img src="/api/blog/images/x" alt="">';
    expect(blogPlainText(html)).toBe('첫 문장입니다. 둘째 문장입니다.');
    expect(firstImage(sanitizeBlogHtml(html))).toBe('https://postfiles.pstatic.net/a.jpg');
    expect(externalImages(sanitizeBlogHtml(html))).toEqual(['https://postfiles.pstatic.net/a.jpg']);
    expect(summarize('가'.repeat(300)).length).toBeLessThanOrEqual(151);
  });
});

describe('이미지 주소 범위', () => {
  it('사이트 안 다른 경로를 img 로 호출하지 못한다', () => {
    const out = sanitizeBlogHtml('<img src="/api/auth/logout" alt="a"><img src="/admin"><img src="/api/blog/images/abc123" alt="ok">');
    expect(out).not.toContain('/api/auth/logout');
    expect(out).not.toContain('"/admin"');
    expect(out).toContain('src="/api/blog/images/abc123"');
  });

  it('쿼리가 있는 주소의 &amp; 를 풀어서 돌려준다', () => {
    expect(firstImage(sanitizeBlogHtml('<img src="https://postfiles.pstatic.net/a.jpg?type=w966&x=1">'))).toBe('https://postfiles.pstatic.net/a.jpg?type=w966&x=1');
  });

  it('글자 그대로 쓴 &lt; 를 태그로 되살리지 않는다', () => {
    expect(blogPlainText('<p>&amp;lt;b&amp;gt;</p>')).toBe('&lt;b&gt;');
  });
});

describe('글 주소', () => {
  it('한글·영문·숫자만 남긴다', () => {
    expect(slugify('누전차단기가 자꾸 내려가요! (원인 5가지)')).toBe('누전차단기가-자꾸-내려가요-원인-5가지');
    expect(slugify('  Hello, World  ')).toBe('hello-world');
    expect(slugify('!!!')).toBeNull();
  });
});

describe('이미지 가져오기', () => {
  it('네이버 이미지 서버 https 주소만 허용한다', () => {
    expect(isImportableImageUrl('https://postfiles.pstatic.net/a.jpg?type=w966')).not.toBeNull();
    expect(isImportableImageUrl('https://blogfiles.naver.net/a.jpg')).not.toBeNull();
    expect(isImportableImageUrl('https://blog.naver.com/a.jpg')).toBeNull();
    expect(isImportableImageUrl('https://pstatic.net./a.jpg')).toBeNull();
    expect(isImportableImageUrl('http://postfiles.pstatic.net/a.jpg')).toBeNull();
    expect(isImportableImageUrl('https://evilpstatic.net/a.jpg')).toBeNull();
    expect(isImportableImageUrl('https://pstatic.net.evil.com/a.jpg')).toBeNull();
    expect(isImportableImageUrl('https://localhost/a.jpg')).toBeNull();
    expect(isImportableImageUrl('https://user:pw@postfiles.pstatic.net/a.jpg')).toBeNull();
    expect(isImportableImageUrl('https://postfiles.pstatic.net:8443/a.jpg')).toBeNull();
  });

  it('파일 앞머리로 형식을 판별하고 SVG·HTML 은 거부한다', () => {
    const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);
    expect(sniffImageMime(pad([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffImageMime(pad([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(sniffImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageMime(new TextEncoder().encode('<html><script>1</script></html>'))).toBeNull();
  });
});
