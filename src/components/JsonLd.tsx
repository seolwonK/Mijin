// JSON-LD 삽입 — Next 공식 json-ld 가이드 패턴(node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
// `<` 를 유니코드 이스케이프해 문자열 안의 "</script>" 로 스크립트가 조기 종료되는 XSS 를 막는다.
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
