import type { Metadata } from 'next';
import GuideArticle, { GuideFaq, GuideSection, GuideWarning } from '@/components/GuideArticle';
import { getGuide } from '@/lib/guides';

const guide = getGuide('nujeon-chadangi')!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guide/${guide.slug}` },
};

const FAQ = [
  {
    q: '누전차단기 테스트 버튼은 얼마나 자주 눌러 보나요?',
    a: '한 달에 한 번 정도 테스트 버튼을 눌러 차단기가 정상적으로 내려가는지 확인하는 것이 권장됩니다. 버튼을 눌러도 내려가지 않으면 차단기 자체가 고장 난 것이므로 교체가 필요합니다.',
  },
  {
    q: '차단기를 올리자마자 다시 내려가면 어떻게 하나요?',
    a: '가전 플러그를 모두 뽑은 상태에서도 바로 내려간다면 배선이나 차단기 자체의 문제입니다. 반복해서 강제로 올리면 배선이 과열될 수 있으니 내린 상태로 두고 전기기사에게 접수해 주세요.',
  },
  {
    q: '아파트인데 관리사무소에 말해야 하나요, 전기기사를 불러야 하나요?',
    a: '세대 안 분전반(두꺼비집) 이후의 배선과 콘센트는 세대 책임이라 전기기사가 처리합니다. 복도등·엘리베이터 등 공용 설비나 여러 세대가 동시에 정전이면 관리사무소에 먼저 알리세요.',
  },
] as const;

export default function Page() {
  return (
    <GuideArticle slug={guide.slug}>
      <GuideSection title="누전차단기는 왜 내려가나요">
        <p>
          두꺼비집(분전반)에는 두 종류의 차단기가 있습니다. <strong>누전차단기</strong>는 전기가 정상 회로
          밖으로 새는 누설전류를 감지하면(가정용은 보통 30mA 기준) 0.03초 안에 전기를 끊고,{' '}
          <strong>배선용 차단기</strong>는 한 회로에 너무 많은 전류가 흐르는 과부하나 합선을 막습니다. 어느
          쪽이 내려갔는지 보면 원인을 절반은 좁힐 수 있습니다.
        </p>
      </GuideSection>

      <GuideSection title="자주 내려가는 원인 5가지">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>가전제품 누전</strong> — 세탁기, 전기온수기, 냉장고, 전기장판, 에어컨 실외기처럼 물이나
            열이 닿는 제품에서 절연이 약해져 전기가 새는 경우가 가장 흔합니다.
          </li>
          <li>
            <strong>습기</strong> — 장마철, 욕실·베란다·보일러실 콘센트, 결로가 생기는 벽면 배선은 습기가
            차면 누전이 됩니다. 비 오는 날만 내려간다면 이쪽을 의심하세요.
          </li>
          <li>
            <strong>노후 배선</strong> — 지은 지 20년이 넘은 주택은 전선 피복이 삭아 벽 속에서 누전이 생기기
            쉽습니다. 특정 가전과 무관하게 내려가면 배선을 점검해야 합니다.
          </li>
          <li>
            <strong>과부하</strong> — 멀티탭에 전열기구를 여러 개 꽂거나 전기히터·건조기·전자레인지를 동시에
            쓰면 배선용 차단기가 내려갑니다. 이 경우는 누전이 아니라 사용량 문제입니다.
          </li>
          <li>
            <strong>차단기 자체 불량</strong> — 차단기도 소모품입니다. 오래되면 아무 이유 없이 내려가거나,
            반대로 테스트 버튼을 눌러도 내려가지 않게 됩니다.
          </li>
        </ol>
      </GuideSection>

      <GuideSection title="지금 바로 해볼 확인 순서">
        <ol className="list-decimal space-y-2 pl-5">
          <li>집 안의 가전 플러그를 모두 뽑고, 스위치는 전부 끕니다.</li>
          <li>
            차단기를 올립니다. <strong>바로 다시 내려가면</strong> 배선이나 차단기 문제이므로 여기서 멈추고
            접수하세요.
          </li>
          <li>올라가 있으면 가전을 하나씩 꽂아 봅니다. 특정 제품을 꽂는 순간 내려가면 그 제품이 원인입니다.</li>
          <li>
            메인이 아니라 분기 차단기 하나만 내려간다면 그 회로에 연결된 콘센트·조명만 점검하면 됩니다.
          </li>
          <li>원인을 찾았다면 해당 제품을 빼 두고, 못 찾았다면 전기기사에게 회로 점검을 맡깁니다.</li>
        </ol>
      </GuideSection>

      <GuideSection title="하지 말아야 할 것">
        <GuideWarning>
          <ul className="list-disc space-y-1 pl-5">
            <li>젖은 손이나 맨발로 두꺼비집을 만지지 마세요.</li>
            <li>내려간 차단기를 반복해서 강제로 올리지 마세요. 배선이 과열돼 화재로 이어질 수 있습니다.</li>
            <li>차단기를 테이프로 고정하거나 다른 선으로 우회 연결하지 마세요.</li>
            <li>콘센트나 벽에서 타는 냄새·그을음이 보이면 확인 순서를 건너뛰고 바로 차단기를 내리고 접수하세요.</li>
          </ul>
        </GuideWarning>
      </GuideSection>

      <GuideSection title="바로 전기기사를 불러야 하는 경우">
        <ul className="list-disc space-y-1 pl-5">
          <li>플러그를 다 뽑아도 차단기가 올라가지 않거나 곧바로 다시 내려갈 때</li>
          <li>콘센트·스위치·벽면에서 타는 냄새, 그을음, 스파크가 있을 때</li>
          <li>벽이나 수도꼭지, 가전 외부를 만졌을 때 찌릿한 느낌이 있을 때</li>
          <li>물이 새는 곳 근처 배선이 의심될 때</li>
          <li>원인을 찾지 못한 채 같은 일이 며칠째 반복될 때</li>
        </ul>
        <p>
          이런 경우는 접수 시 긴급도를 <strong>긴급</strong> 이상으로 선택하면 담당 업체가 우선 배정됩니다.
          타는 냄새나 찌릿함이 있으면 <strong>초긴급</strong>으로 접수해 주세요.
        </p>
      </GuideSection>

      <GuideFaq items={FAQ} />
    </GuideArticle>
  );
}
