// IndexNow 핑 — 새/갱신 URL 을 네이버·Bing 등 IndexNow 참여 엔진에 즉시 알린다(Google 은 미지원).
// 키 파일: public/52e8758c02d28b41471292ab4ff7f951.txt (내용 = 키). 배포 후 실행:
//   npm run indexnow                       # 라이브 sitemap.xml 의 전체 URL
//   npm run indexnow -- --urls /guide/x /areas/y   # 특정 경로만
// api.indexnow.org 에 제출하면 참여 엔진 전체(네이버 Yeti 포함)로 공유된다. 응답 200/202 = 접수.
const HOST = 'xn--ok0bp94bnc26kra.com';
const KEY = '52e8758c02d28b41471292ab4ff7f951';
const BASE = `https://${HOST}`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

async function urlsFromSitemap() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--urls');
  const urlList = i >= 0 ? args.slice(i + 1).map((p) => (p.startsWith('http') ? p : `${BASE}${p}`)) : await urlsFromSitemap();
  if (urlList.length === 0) throw new Error('no urls');
  const keyCheck = await fetch(`${BASE}/${KEY}.txt`);
  if (!keyCheck.ok || (await keyCheck.text()).trim() !== KEY) throw new Error(`key file not served at ${BASE}/${KEY}.txt (${keyCheck.status})`);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${BASE}/${KEY}.txt`, urlList }),
  });
  const body = await res.text();
  console.log(`IndexNow ${res.status} ${res.statusText} — ${urlList.length} urls${body ? `\n${body}` : ''}`);
  if (res.status !== 200 && res.status !== 202) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
