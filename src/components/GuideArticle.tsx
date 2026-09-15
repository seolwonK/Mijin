import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Surface from '@/components/Surface';
import JsonLd from '@/components/JsonLd';
import { buttonClasses } from '@/components/Button';
import { GUIDES, getGuide } from '@/lib/guides';
import { getArticleGraph, getFaqPageSchema } from '@/lib/schema';
import { formatKoreanDate } from '@/lib/pageDates';
import { COMPANY } from '@/lib/company';

// 전기 상식 가이드 공통 프레임 — 헤더·제목·메타·본문·접수 CTA·관련 글·Article 스키마.
// 본문은 각 page.tsx 가 children 으로 넘긴다(섹션은 <GuideSection> 사용).
export default function GuideArticle({
  slug,
  children,
}: Readonly<{ slug: string; children: React.ReactNode }>) {
  const guide = getGuide(slug);
  if (!guide) throw new Error(`unknown guide: ${slug}`);
  const related = GUIDES.filter((g) => g.slug !== slug);
  const requestHref = guide.symptom ? `/request/new?symptom=${guide.symptom}` : '/request/new';

  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <JsonLd
        data={getArticleGraph({
          path: `/guide/${slug}`,
          headline: guide.title,
          description: guide.description,
          datePublished: guide.published,
          dateModified: guide.updated,
          keywords: guide.keywords,
        })}
      />
      <PageHeader
        title="전기 상식"
        back="/guide"
        headingAs="p"
        crumbs={[
          { label: '홈', href: '/' },
          { label: '전기 상식', href: '/guide' },
          { label: guide.short, href: `/guide/${slug}` },
        ]}
      />

      <article className="mx-auto w-full max-w-2xl px-5 pt-6">
        <p className="text-xs font-bold text-brand-600">전기 상식</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold text-fg md:text-3xl">{guide.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{guide.description}</p>
        <p className="mt-3 text-xs text-neutral-400">
          최종 수정일 {formatKoreanDate(guide.updated)} · 작성 {COMPANY.name} 운영팀 · 감전·화재 위험이 있는
          작업은 직접 하지 말고 전기기사에게 맡기세요.
        </p>

        {children}

        <Surface tint as="section" className="mt-10 rounded-2xl p-5">
          <h2 className="text-lg font-extrabold text-fg">직접 해결이 어렵다면 접수해 주세요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            접수는 무료이고, 승인된 출동 업체·전기기사가 현장을 확인한 뒤 비용을 안내합니다. 성남·수도권을
            비롯해 전국 시/군/구 단위로 접수할 수 있습니다.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href={requestHref} className={buttonClasses('primary', 'md', 'flex-1')}>
              고장 접수하기
            </Link>
            <Link href="/areas/seongnam" className={buttonClasses('secondary', 'md', 'flex-1')}>
              성남 출동 안내
            </Link>
          </div>
        </Surface>

        <section className="mt-10">
          <h2 className="text-lg font-extrabold text-fg">함께 읽으면 좋은 글</h2>
          <ul className="mt-3 space-y-2">
            {related.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guide/${g.slug}`}
                  className="block rounded-2xl bg-white p-4 shadow-surface-sm transition hover:bg-neutral-50"
                >
                  <p className="font-bold text-fg">{g.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{g.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  );
}

export function GuideSection({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-extrabold text-fg">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

export function GuideWarning({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900">
      {children}
    </div>
  );
}

export function GuideFaq({ items }: Readonly<{ items: ReadonlyArray<{ q: string; a: string }> }>) {
  return (
    <section className="mt-8">
      {/* 화면과 같은 items 배열로 FAQPage 를 만든다(AI 인용용, 리치결과 목적 아님) */}
      <JsonLd data={getFaqPageSchema(items)} />
      <h2 className="text-xl font-extrabold text-fg">자주 묻는 질문</h2>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <details key={item.q} className="rounded-2xl bg-neutral-50 p-4">
            <summary className="cursor-pointer font-bold text-fg">{item.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
