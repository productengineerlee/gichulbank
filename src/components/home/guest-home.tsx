import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CertificationSummary } from "@/lib/certifications";
import type { SiteStats } from "@/lib/exams";
import { CertGrid, SectionTitle } from "./home-parts";
import type { CertificationProof } from "@/lib/reviews";

const FEATURES = [
  { title: "회차별 실전 기출", body: "실제 시험과 같은 시간·배점으로 회차 전체를 풀고, 제출하면 바로 채점과 해설을 볼 수 있어요." },
  { title: "오답노트 자동 저장", body: "틀린 문제는 오답노트에 모이고, 정답과 해설을 언제든 다시 확인할 수 있어요." },
  { title: "과목별 약점 분석", body: "과목·시대별 정답률과 자주 틀리는 유형을 정리해 보여 드려요." },
  { title: "오늘의 추천 10문제", body: "복습할 오답, 약한 과목, 아직 안 푼 문제를 섞어 매일 10문제를 골라 드려요." },
];

const LOOP = [
  { title: "기출 풀기", body: "회차 전체 또는 추천 10문제" },
  { title: "오답 저장", body: "틀린 문제는 자동으로 모여요" },
  { title: "간격 복습", body: "1일 · 3일 · 7일 뒤에 다시" },
  { title: "졸업", body: "3번 연속 맞히면 끝" },
];

/** 실제 풀이 화면을 닮은 예시. 자료까지 넣어 문항만 읽어도 풀 수 있게 한다(강화도 조약 1876 → 임오군란 1882).
    색은 정답 표시에만 아주 옅게 쓴다. */
function AppPreview() {
  const choices = ["병인양요가 일어났다.", "임오군란이 일어났다.", "신미양요가 일어났다."];
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-rule bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between text-sm">
        <span className="text-mute">한국사 · 오늘의 추천</span>
        <span className="font-semibold text-ink">3 / 10</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule"><div className="h-full w-[30%] bg-ink" /></div>
      <p className="mt-5 text-xs text-mute">예시 문항 · 근대</p>
      <p className="mt-1.5 font-semibold leading-relaxed text-ink [word-break:keep-all]">다음 조약이 체결된 이후에 있었던 사실로 옳은 것은?</p>
      <p className="mt-3 rounded-md border border-rule bg-paper px-3 py-2.5 text-sm leading-relaxed text-ink-soft [word-break:keep-all]">운요호 사건을 계기로 조선과 일본이 맺은 조약으로, 부산 외 두 곳의 항구를 열기로 하였다.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {choices.map((choice, index) => {
          const correct = index === 1;
          return (
            <li key={choice} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${correct ? "border-accent bg-accent-soft text-ink" : "border-rule text-ink-soft"}`}>
              <span className={`grid size-5 place-items-center rounded-full text-[11px] font-semibold ${correct ? "bg-accent text-white" : "bg-paper text-mute"}`}>{index + 1}</span>{choice}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-rule pt-3 text-sm text-ink-soft"><span className="font-semibold text-ink">정답</span> · 연속 정답 2/3, 7일 뒤 다시 복습해요.</div>
      <p className="sr-only">예시 화면입니다.</p>
    </div>
  );
}

export function GuestHome({ certifications, stats, proofs }: { certifications: CertificationSummary[]; stats: SiteStats; proofs?: Record<string, CertificationProof> }) {
  const rounds = certifications.reduce((sum, cert) => sum + cert.examCount, 0);
  return (
    <>
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-24">
          <div>
            <p className="text-sm text-mute">국가자격·공무원 기출문제 무료 풀이</p>
            <h1 className="mt-4 text-[34px] leading-[1.25] font-bold tracking-tight text-ink [word-break:keep-all] sm:text-[44px]">
              기출을 풀면,<br />다시 볼 문제는<br className="sm:hidden" /> 저희가 챙길게요
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft [word-break:keep-all]">회차별 기출을 실전처럼 풀고, 틀린 문제는 오답노트로 모아 간격을 두고 다시 풀어요. 풀수록 약한 과목이 분명해집니다.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link className="flex items-center gap-2 rounded-md bg-ink px-5 py-3 font-medium text-white hover:bg-ink-soft" href="/auth/signup">무료로 시작하기<ArrowRight className="size-4" /></Link>
              <Link className="rounded-md border border-rule bg-white px-5 py-3 font-medium text-ink hover:border-ink/25" href="/license">기출문제 둘러보기</Link>
            </div>
            <p className="mt-6 text-sm text-mute">회원가입만 하면 무료 · 답안 자동 저장 · 제출 즉시 채점과 해설</p>
          </div>
          <AppPreview />
        </div>
      </section>

      <section className="border-b border-rule">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 sm:grid-cols-4">
          {[
            { label: "제공 자격증", value: `${certifications.length}종` },
            { label: "기출 회차", value: `${rounds}회차` },
            { label: "누적 응시", value: `${stats.attemptCount.toLocaleString("ko-KR")}회` },
            { label: "누적 문제 풀이", value: `${stats.answeredCount.toLocaleString("ko-KR")}문항` },
          ].map((item) => (
            <div key={item.label} className="py-8">
              <dt className="text-sm text-mute">{item.label}</dt>
              <dd className="mt-1 text-2xl font-bold tracking-tight text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="certifications" className="mx-auto max-w-6xl px-5 py-20">
        <SectionTitle eyebrow="기출문제" title="어떤 시험을 준비하세요?" description="회차 전체를 실전처럼 풀거나, 오늘의 추천 10문제로 가볍게 시작하세요." action={{ href: "/license", label: "전체 자격증 보기" }} />
        <CertGrid certifications={certifications} loggedIn={false} proofs={proofs} />
        <p className="mt-6 text-sm text-mute">국가전문자격·공무원 시험 기출문제를 차례로 추가하고 있습니다.</p>
      </section>

      <section className="border-y border-rule bg-paper py-20">
        <div className="mx-auto max-w-6xl px-5">
          <SectionTitle eyebrow="기출뱅크로 공부하면" title="풀기만 하면, 정리는 알아서" />
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ title, body }) => (
              <article key={title} className="border-t border-ink/80 pt-4">
                <h3 className="font-bold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft [word-break:keep-all]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <SectionTitle eyebrow="오답이 실력이 되는 과정" title="틀린 문제는 졸업할 때까지 다시 만나요" description="1일·3일·7일 간격으로 다시 풀고, 3번 연속 맞히면 오답노트에서 졸업해요." />
        <ol className="grid overflow-hidden rounded-xl border border-rule sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-rule">
          {LOOP.map(({ title, body }, index) => (
            <li key={title} className="border-rule p-6 max-lg:border-b">
              <span className="text-sm font-semibold text-mute tabular-nums">0{index + 1}</span>
              <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 rounded-xl bg-ink px-8 py-10 text-white sm:px-12">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">오늘의 10문제부터 시작해 볼까요?</h2>
            <p className="mt-2 text-white/70">가입은 1분이면 충분하고, 기출문제·오답노트·약점 분석은 모두 무료예요.</p>
          </div>
          <Link className="flex items-center gap-2 rounded-md bg-white px-5 py-3 font-medium text-ink hover:bg-paper" href="/auth/signup">무료로 시작하기<ArrowRight className="size-4" /></Link>
        </div>
      </section>
    </>
  );
}
