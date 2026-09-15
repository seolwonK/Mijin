import type { Metadata } from 'next';
import GuideArticle, { GuideFaq, GuideSection } from '@/components/GuideArticle';
import { getGuide } from '@/lib/guides';

const guide = getGuide('jeongi-suri-biyong')!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guide/${guide.slug}` },
};

const FAQ = [
  {
    q: '견적만 받고 취소해도 되나요?',
    a: '가능하지만, 이미 출동한 뒤라면 출장·진단비가 발생할 수 있습니다. 접수할 때 증상·사진·음성으로 상황을 자세히 남기면 업체가 출동 전에 대략의 범위를 가늠할 수 있어 불필요한 출동을 줄일 수 있습니다.',
  },
  {
    q: '카드 결제나 현금영수증이 되나요?',
    a: '수리 대금은 전기아저씨가 아니라 현장의 시공 업체·전기기사와 직접 정산합니다. 카드·계좌이체·현금영수증 가능 여부는 업체마다 다르므로 작업 전에 미리 확인해 주세요.',
  },
  {
    q: '야간이나 주말에도 출동하나요?',
    a: '온라인 접수는 시간 제한 없이 가능하고, 실제 출동 가능 시간은 배정된 업체의 운영 현황에 따릅니다. 야간·휴일 출동은 할증이 붙는 경우가 일반적이니 긴급하지 않다면 평일 낮 시간으로 조율하는 편이 비용을 줄입니다.',
  },
] as const;

export default function Page() {
  return (
    <GuideArticle slug={guide.slug}>
      <GuideSection title="왜 정찰 요금표가 없나요">
        <p>
          같은 ‘콘센트가 안 돼요’라도 원인은 콘센트 접촉 불량일 수도, 벽 속 배선 단선일 수도, 분전반 차단기
          불량일 수도 있습니다. 현장에서 원인을 확인하기 전에는 작업 범위와 자재를 알 수 없기 때문에 전기 수리는
          정찰가 대신 <strong>현장 확인 후 견적</strong>이 기본입니다. {`전기아저씨`}도 앱 안에 가격표나 온라인
          결제를 두지 않고, 접수는 무료로 받은 뒤 배정된 업체가 현장에서 비용을 안내합니다.
        </p>
      </GuideSection>

      <GuideSection title="비용을 구성하는 4가지">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>출장·진단비</strong> — 현장까지 이동해 원인을 찾는 비용. 간단한 작업은 이 비용 안에서 끝나기도
            합니다.
          </li>
          <li>
            <strong>자재비</strong> — 차단기, 콘센트, 스위치, 전선, 분전반 등 교체 부품. 같은 부품도 등급과 용량에
            따라 가격 차이가 있습니다.
          </li>
          <li>
            <strong>작업비</strong> — 작업 시간, 난이도, 투입 인원. 벽을 뚫거나 천장을 열어야 하면 올라갑니다.
          </li>
          <li>
            <strong>할증</strong> — 야간·휴일·긴급 출동, 먼 거리 이동, 고소 작업 등이 붙으면 추가됩니다.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="작업 규모별 체감 차이">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>단순 교체</strong> — 콘센트·스위치 1개, 차단기 1개 교체처럼 30분 내외 작업은 출장비에 소액
            자재비가 더해지는 수준에서 끝나는 경우가 많습니다.
          </li>
          <li>
            <strong>원인 추적</strong> — 누전 회로를 찾는 작업은 절연저항 측정과 회로 분리를 반복해야 해서 시간이
            들고, 원인이 벽 속이면 다음 단계로 이어집니다.
          </li>
          <li>
            <strong>배선·분전반 공사</strong> — 노후 배선 교체, 분전반 전체 교체, 회로 증설은 자재와 인원이 커서
            반드시 <strong>서면 견적</strong>을 받고 비교한 뒤 결정하세요.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="현장에서 확인할 5가지">
        <ol className="list-decimal space-y-2 pl-5">
          <li>작업을 시작하기 전에 예상 비용과 작업 범위를 먼저 듣습니다.</li>
          <li>교체 자재의 종류와 수량을 물어보고, 교체된 부품은 확인합니다.</li>
          <li>원래 견적에 없던 작업이 추가되면 진행 전에 동의를 구하는지 봅니다.</li>
          <li>영수증이나 작업 내역을 받아 둡니다. 하자가 생겼을 때 근거가 됩니다.</li>
          <li>
            완료 후 문자로 오는 만족도 조사에 솔직하게 답해 주세요. 평가는 다음 고객의 배정에 반영됩니다.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="접수부터 정산까지">
        <p>
          접수(무료) → 담당 업체 배정 → 출동·현장 확인 → 견적 안내와 동의 → 수리 → 현장 정산 → 만족도 조사
          순서입니다. 긴급도는 초긴급(1시간 내 응대 목표)·긴급(2시간 내)·일반(순차) 3단계에서 고르며, 긴급도가
          높을수록 빨리 오는 대신 야간·휴일에는 할증이 붙을 수 있습니다.
        </p>
      </GuideSection>

      <GuideFaq items={FAQ} />
    </GuideArticle>
  );
}
