import type { Metadata } from 'next';
import GuideArticle, { GuideFaq, GuideSection, GuideWarning } from '@/components/GuideArticle';
import { getGuide } from '@/lib/guides';

const guide = getGuide('jeongjeon-hwakin')!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guide/${guide.slug}` },
};

const FAQ = [
  {
    q: '동네 전체가 정전이면 어디에 연락하나요?',
    a: '한국전력 고객센터 국번 없이 123으로 연락하거나 한전 홈페이지·앱의 정전 안내에서 복구 예정 시간을 확인할 수 있습니다. 이 경우 집 안 설비 문제가 아니므로 전기기사를 부를 필요가 없습니다.',
  },
  {
    q: '아파트 정전은 누가 고치나요?',
    a: '여러 세대가 함께 정전이면 공용 설비 문제로 관리사무소가 처리합니다. 우리 세대만 정전이고 세대 분전반 이후의 문제라면 전기기사가 출동해 수리합니다.',
  },
  {
    q: '아파트 정전은 복구까지 얼마나 걸리고, 피해 보상은 누구에게 묻나요?',
    a: '동 전체·단지 정전은 관리사무소가 원인(변압기·차단기 등)을 파악해 복구하며 시간은 원인에 따라 다릅니다. 한전 설비 정전은 한전 123 또는 한전 앱의 정전 안내에서 복구 예정 시간을 확인할 수 있고, 한전 귀책 정전의 보상도 123에 문의합니다. 우리 세대만 정전이면 세대 설비 문제라 전기기사가 처리합니다.',
  },
  {
    q: '정전 후 전기가 들어왔는데 일부 가전이 안 켜져요.',
    a: '복전 순간의 전압 변동으로 가전 내부 퓨즈나 기판이 손상되기도 합니다. 콘센트에 전기가 들어오는지 먼저 확인하고, 콘센트는 정상인데 제품만 안 되면 가전 서비스센터로 문의하세요.',
  },
] as const;

export default function Page() {
  return (
    <GuideArticle slug={guide.slug}>
      <GuideSection title="1분 확인: 동네 정전인가, 우리 집만인가">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            창밖의 가로등, 옆집 불빛, 아파트라면 복도등과 엘리베이터를 확인합니다. 모두 꺼져 있으면{' '}
            <strong>한전 정전</strong>이므로 123에 문의하거나 복구를 기다리면 됩니다.
          </li>
          <li>
            다른 집은 멀쩡하고 우리 집만 꺼졌다면 <strong>옥내 설비 문제</strong>입니다. 아래 순서로 넘어가세요.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="우리 집만 정전일 때 확인 순서">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            두꺼비집(분전반)을 엽니다. <strong>메인 차단기</strong>가 내려가 있으면 집 전체, <strong>분기
            차단기</strong> 하나만 내려가 있으면 그 회로만 정전입니다.
          </li>
          <li>
            가전 플러그를 뽑은 뒤 차단기를 올려 봅니다. 올라가면 과부하나 특정 가전이 원인일 가능성이 크고, 바로
            다시 내려가면 누전·합선입니다(자세한 순서는 누전차단기 글 참고).
          </li>
          <li>
            <strong>두꺼비집이 올라가 있는데 정전</strong>이라면 세대 안 문제가 아닐 가능성이 큽니다. 단독주택은 계량기함
            쪽 차단기, 아파트는 세대 인입 차단기나 동 전체 설비, 그 밖에는 한전 인입선 문제입니다. 이 구간은 직접
            만지지 말고 접수하거나 관리사무소·한전(123)에 문의하세요.
          </li>
          <li>
            전기요금이 오래 미납된 경우 한전이 공급을 제한할 수 있습니다. 짚이는 게 있다면 123에 확인하세요.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="정전 중 하지 말아야 할 것">
        <GuideWarning>
          <ul className="list-disc space-y-1 pl-5">
            <li>촛불 대신 휴대폰 손전등이나 건전지 랜턴을 쓰세요. 촛불은 정전 화재의 흔한 원인입니다.</li>
            <li>냉장고 문을 자주 열지 마세요. 닫아 두면 몇 시간은 온도가 유지됩니다.</li>
            <li>전기히터·다리미처럼 열이 나는 기기는 전원을 꺼 두세요. 복전 순간 동시에 켜지면 다시 차단기가 내려가거나 과열될 수 있습니다.</li>
            <li>두꺼비집 안쪽 배선이나 계량기함을 열어 손대지 마세요.</li>
          </ul>
        </GuideWarning>
      </GuideSection>

      <GuideSection title="원인별로 누가 처리하나요">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>차단기가 내려간 것</strong> — 가전이 원인이면 해당 제품을 빼고 쓰면 되고, 배선·차단기가 원인이면
            전기기사가 수리합니다.
          </li>
          <li>
            <strong>계량기·인입선·전봇대</strong> — 한전 설비이므로 123에 신고합니다.
          </li>
          <li>
            <strong>아파트 공용 설비</strong> — 관리사무소가 처리합니다. 세대 내부는 전기기사 몫입니다.
          </li>
          <li>
            <strong>원인을 모를 때</strong> — 정전은 접수 시 긴급도를 <strong>초긴급</strong>으로 선택할 수 있고, 초긴급은
            1시간 내 응대를 목표로 배정합니다.
          </li>
        </ul>
      </GuideSection>

      <GuideFaq items={FAQ} />
    </GuideArticle>
  );
}
