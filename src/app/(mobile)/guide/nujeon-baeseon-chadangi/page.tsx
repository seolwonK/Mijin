import type { Metadata } from 'next';
import Link from 'next/link';
import GuideArticle, { GuideFaq, GuideSection, GuideWarning } from '@/components/GuideArticle';
import { getGuide } from '@/lib/guides';

const guide = getGuide('nujeon-baeseon-chadangi')!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guide/${guide.slug}` },
};

const FAQ = [
  {
    q: '두꺼비집에 누전차단기가 여러 개 있어요. 뭐가 메인인가요?',
    a: '보통 가장 왼쪽(또는 위)에 있고 용량 표기가 가장 큰 것이 메인 개폐기입니다. 최근 주택은 메인뿐 아니라 욕실·주방처럼 물을 쓰는 회로에도 누전차단기를 따로 두기도 합니다. 테스트 버튼이 있는 것이 누전차단기, 없는 것이 배선용 차단기입니다.',
  },
  {
    q: '배선용 차단기만 있는 집인데 누전차단기를 꼭 달아야 하나요?',
    a: '배선용 차단기는 과전류만 막고 누전은 감지하지 못하므로 감전·화재 예방을 위해 누전차단기 설치를 권장합니다. 특히 욕실·세탁기·전기온수기 회로는 우선 대상입니다. 분전반 작업이라 전기기사가 처리합니다.',
  },
  {
    q: '차단기 하나만 내려가는데 그 방 콘센트에 아무것도 안 꽂았어요.',
    a: '가전이 원인이 아니라 그 회로의 배선·콘센트·스위치 자체에서 누전이나 단락이 생긴 상태입니다. 벽 속 배선 절연 저하나 콘센트 내부 손상이 흔한 원인이며, 절연저항 측정으로 구간을 찾아야 하므로 접수해 주세요.',
  },
] as const;

export default function Page() {
  return (
    <GuideArticle slug={guide.slug}>
      <GuideSection title="두꺼비집 안에는 두 종류의 차단기가 있습니다">
        <p>
          분전반(두꺼비집)을 열면 보통 <strong>메인 개폐기 1개</strong>와 방·주방·욕실·에어컨 등으로 나뉜{' '}
          <strong>분기 차단기 여러 개</strong>가 있습니다. 메인은 대개 누전차단기이고, 분기는 배선용 차단기이거나 회로에
          따라 누전차단기가 섞여 있습니다. 어떤 차단기가 내려갔는지에 따라 원인이 달라지므로 먼저 종류를 구분해 두면
          대처가 훨씬 빨라집니다.
        </p>
      </GuideSection>

      <GuideSection title="누전차단기와 배선용 차단기의 차이">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>누전차단기(ELB)</strong> — 전기가 회로 밖으로 새는 누설전류를 감지해 끊습니다. 가정용은 보통 30mA
            누설을 0.03초 안에 차단하며, 과전류도 함께 막습니다. 감전·화재 예방이 목적입니다.
          </li>
          <li>
            <strong>배선용 차단기(MCCB·MCB)</strong> — 한 회로에 정격보다 큰 전류가 흐르는 과부하와 합선(단락)만 막습니다.
            누전은 감지하지 못합니다.
          </li>
          <li>
            <strong>구분하는 법</strong> — 누전차단기에는 <strong>테스트(T) 버튼</strong>이 있고 ‘누전차단기’ 또는 ‘ELB’
            표기가 있습니다. 배선용 차단기에는 테스트 버튼이 없습니다.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="어느 차단기가 내려갔는지로 원인 읽기">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>분기 차단기 하나만 내려감</strong> — 그 회로의 과부하(전열기구 동시 사용) 또는 그 회로 안의 누전·단락입니다.
            해당 회로의 플러그를 모두 뽑고 올려 보세요. 올라가면 과부하나 가전 문제, 바로 내려가면 배선·콘센트 문제입니다.
          </li>
          <li>
            <strong>메인 누전차단기만 내려감</strong> — 특정 회로가 아니라 집 전체 누설전류가 기준을 넘은 상태입니다. 습기가
            찬 곳, 오래된 배선, 물 쓰는 가전(세탁기·온수기) 순으로 의심합니다. 분기는 멀쩡한데 메인만 반복되면 배선 점검이
            필요합니다.
          </li>
          <li>
            <strong>메인과 분기가 같이 내려감</strong> — 큰 단락이나 심한 누전입니다. 반복해서 올리지 말고 접수하세요.
          </li>
          <li>
            <strong>안 올라감</strong> — 트립된 차단기는 레버가 중간에 걸립니다. 완전히 아래(OFF)까지 내렸다가 올리세요. 그래도
            안 되면 차단기 고장이거나 누전이 계속되는 것입니다.
          </li>
        </ol>
        <p>
          원인별 확인 순서와 하지 말아야 할 행동은{' '}
          <Link href="/guide/nujeon-chadangi" className="font-bold text-brand-700 underline">
            누전차단기(두꺼비집)가 내려가는 이유 5가지
          </Link>
          에 정리했습니다.
        </p>
      </GuideSection>

      <GuideSection title="차단기를 바꿔야 하는 신호">
        <ul className="list-disc space-y-1 pl-5">
          <li>테스트 버튼을 눌러도 내려가지 않는다(누전차단기가 누전을 못 잡는 상태).</li>
          <li>아무 이유 없이 자주 내려가거나, 반대로 과부하인데도 내려가지 않는다.</li>
          <li>레버가 헐겁거나 열이 나고, 차단기 주변이 변색·그을음이 있다.</li>
          <li>설치한 지 오래되어 부품 표기가 지워졌거나 누전차단기 자체가 없는 구형 분전반이다.</li>
        </ul>
        <GuideWarning>
          차단기 교체·분전반 작업은 메인 전원을 다루는 일이라 직접 하지 마세요. 접수 시 두꺼비집 사진을 함께 남기면 출동
          전에 필요한 부품과 범위를 가늠할 수 있습니다.
        </GuideWarning>
      </GuideSection>

      <GuideFaq items={FAQ} />
    </GuideArticle>
  );
}
