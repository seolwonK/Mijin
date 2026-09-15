import type { Metadata } from 'next';
import GuideArticle, { GuideFaq, GuideSection, GuideWarning } from '@/components/GuideArticle';
import { getGuide } from '@/lib/guides';

const guide = getGuide('gingeup-nujeon')!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guide/${guide.slug}` },
};

const FAQ = [
  {
    q: '누전이면 바로 감전되나요?',
    a: '누전차단기가 정상이라면 누설전류를 감지하는 순간 전기를 끊어 감전을 막습니다. 문제는 차단기가 없거나 고장 난 집, 그리고 차단기가 감지하지 못하는 미세한 누전이 열로 쌓여 화재로 이어지는 경우입니다. 그래서 신호가 보이면 차단기가 내려가지 않았더라도 점검이 필요합니다.',
  },
  {
    q: '오래된 집이라 누전차단기가 없어요.',
    a: '분전반에 배선용 차단기만 있는 구형 주택이라면 누전차단기 설치를 권장합니다. 설치 자체는 전기기사가 분전반에서 처리하는 작업이며, 접수 시 "누전차단기 설치 문의"로 남겨 주세요.',
  },
  {
    q: '비 오는 날만 차단기가 내려가요.',
    a: '베란다·욕실·외벽 쪽 콘센트나 배선에 습기가 차서 생기는 누전일 가능성이 큽니다. 마른 날 정상이라고 두면 장마철에 반복되고 화재 위험도 커지니 해당 회로를 점검받으세요.',
  },
] as const;

export default function Page() {
  return (
    <GuideArticle slug={guide.slug}>
      <GuideSection title="누전이 위험한 이유">
        <p>
          누전은 전기가 정해진 회로 밖으로 새어 나가는 상태입니다. 새는 전기가 사람 몸을 지나면{' '}
          <strong>감전</strong>이 되고, 콘센트·배선에서 열로 쌓이면 <strong>전기 화재</strong>가 됩니다.
          누전차단기가 잡아 주는 경우가 많지만, 차단기가 없거나 고장 났거나 미세한 누전이 오래 이어지면 잡히지
          않습니다. 아래 신호는 차단기가 내려가지 않았더라도 그냥 두면 안 되는 것들입니다.
        </p>
      </GuideSection>

      <GuideSection title="지금 바로 조치해야 하는 신호 6가지">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>타는 냄새·그을음</strong> — 콘센트, 스위치, 멀티탭, 분전반 주변에서 플라스틱 타는 냄새가 나거나
            검게 변한 자국이 보일 때
          </li>
          <li>
            <strong>찌릿함</strong> — 벽, 수도꼭지, 세탁기·냉장고 외부, 금속 문틀을 만졌을 때 따끔하거나 저릿할 때
          </li>
          <li>
            <strong>차단기 반복</strong> — 누전차단기가 올려도 계속 내려가거나, 며칠 사이 여러 번 내려갈 때
          </li>
          <li>
            <strong>스파크·불꽃</strong> — 플러그를 꽂고 뺄 때가 아닌데도 콘센트나 스위치에서 불꽃이 튈 때
          </li>
          <li>
            <strong>전기요금 급증</strong> — 사용 습관이 그대로인데 요금이 눈에 띄게 늘었을 때(새는 전기가 계량됨)
          </li>
          <li>
            <strong>습기와 함께 나타나는 이상</strong> — 물 새는 곳, 결로가 생기는 벽 근처 콘센트가 따뜻하거나
            누전차단기가 비 오는 날만 내려갈 때
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="즉시 할 일, 순서대로">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>메인 차단기를 내립니다.</strong> 어느 회로인지 모르겠으면 집 전체를 끄는 것이 안전합니다.
          </li>
          <li>
            의심되는 가전의 플러그를 뽑습니다. 이때 <strong>젖은 손은 절대 금지</strong>이고, 플러그 몸통을 잡고
            뽑습니다.
          </li>
          <li>물이 고이거나 새는 곳, 찌릿함이 느껴진 금속에는 접근하지 않습니다.</li>
          <li>
            연기나 불꽃이 계속 보이면 <strong>119</strong>에 먼저 신고합니다. 전기 화재에는 물을 뿌리지 마세요.
          </li>
          <li>
            위 상황이 진정되면 <strong>초긴급</strong>으로 접수합니다. 초긴급은 1시간 내 응대를 목표로 담당 업체가
            우선 배정됩니다.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="하지 말아야 할 것">
        <GuideWarning>
          <ul className="list-disc space-y-1 pl-5">
            <li>타는 냄새가 나는 콘센트를 ‘잠깐만’ 계속 쓰지 마세요.</li>
            <li>내려간 누전차단기를 반복해서 올리며 버티지 마세요.</li>
            <li>콘센트 커버나 분전반을 열어 배선을 직접 만지지 마세요.</li>
            <li>절연 테이프로 감아 두고 넘어가지 마세요. 원인은 그대로 남습니다.</li>
          </ul>
        </GuideWarning>
      </GuideSection>

      <GuideSection title="전기기사는 현장에서 무엇을 하나요">
        <p>
          출동한 전기기사는 보통 분전반에서 회로를 하나씩 분리하며 <strong>절연저항</strong>을 측정해 어느 회로에서
          전기가 새는지 찾습니다. 원인이 가전이면 해당 제품을 분리하고, 콘센트·스위치면 부품을 교체하고, 벽 속
          배선이면 해당 구간을 교체하거나 새 회로를 넣습니다. 작업 범위에 따라 비용이 크게 달라지므로{' '}
          <strong>작업 전에 견적을 듣고 동의한 뒤</strong> 진행하는 것이 원칙입니다.
        </p>
      </GuideSection>

      <GuideFaq items={FAQ} />
    </GuideArticle>
  );
}
