import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CertificationSummary } from "@/lib/certifications";
import type { AccuracyStat } from "@/lib/insights";
import { CertGrid, SectionTitle } from "./home-parts";
import type { CertificationProof } from "@/lib/reviews";

export type MemberSummary = {
  name: string;
  streak: { current: number; best: number; studiedToday: boolean; recent: { date: string; count: number }[] } | null;
  review: { active: number; due: number };
  mainCert: { code: string; name: string; accuracy: number; answered: number; weakest: AccuracyStat | null } | null;
  inProgress: { slug: string; title: string } | null;
};

const todayLabel = () => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date());

function streakNote(streak: MemberSummary["streak"]) {
  if (!streak || streak.current === 0) return "아직 오늘 푼 문제가 없어요";
  return streak.studiedToday ? "오늘 학습 완료" : "오늘 풀면 이어져요";
}

/** 오늘 할 일 한 칸. 큰 숫자 하나와 짧은 설명, 텍스트 링크만 둔다. */
function Panel({ label, value, note, href, linkLabel }: { label: string; value: React.ReactNode; note: string; href: string; linkLabel: string }) {
  return (
    <div className="flex flex-col p-6">
      <p className="text-sm text-mute">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-ink-soft [word-break:keep-all]">{note}</p>
      <Link href={href} className="mt-auto flex items-center gap-1 pt-5 text-sm font-medium text-accent hover:underline">{linkLabel}<ArrowRight className="size-3.5" /></Link>
    </div>
  );
}

export function MemberHome({ summary, certifications, proofs }: { summary: MemberSummary; certifications: CertificationSummary[]; proofs?: Record<string, CertificationProof> }) {
  const { streak, review, mainCert, inProgress } = summary;
  const dailyHref = mainCert ? `/practice?mode=daily&cert=${mainCert.code}` : "/practice?mode=daily";
  const recent = streak?.recent.slice(-7) ?? [];

  return (
    <>
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-6xl px-5 pt-12 pb-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-sm text-mute">{todayLabel()}</p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink [word-break:keep-all] sm:text-3xl">{summary.name}님, 오늘도 한 회차씩 쌓아 가요</h1>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-ink-soft"><span className="font-semibold text-ink">연속 {streak?.current ?? 0}일</span> · {streakNote(streak)}</p>
              {recent.length > 0 && (
                <div className="mt-2 flex gap-1 sm:justify-end" aria-label="최근 7일 학습 기록">
                  {recent.map((day) => <i key={day.date} title={`${day.date} · ${day.count}문항`} className={`block h-1.5 w-6 rounded-full ${day.count ? "bg-accent" : "bg-rule"}`} />)}
                </div>
              )}
            </div>
          </div>

          {inProgress && (
            <Link href={`/exams/${inProgress.slug}/take`} className="mt-8 flex items-center justify-between gap-3 rounded-lg border border-rule bg-white px-5 py-3.5 text-sm hover:border-ink/25">
              <span className="text-ink-soft"><span className="font-semibold text-ink">풀던 회차가 있어요</span> · {inProgress.title}</span>
              <span className="flex shrink-0 items-center gap-1 font-medium text-accent">이어 풀기<ArrowRight className="size-3.5" /></span>
            </Link>
          )}

          <div className="mt-8 grid overflow-hidden rounded-xl border border-rule bg-white md:grid-cols-[1.2fr_1fr_1fr] md:divide-x md:divide-rule max-md:divide-y max-md:divide-rule">
            <div className="flex flex-col bg-ink p-6 text-white">
              <p className="text-sm text-white/60">{mainCert ? mainCert.name : "자격증을 고르면 시작돼요"}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">오늘의 추천 10문제</p>
              <p className="mt-1.5 text-sm text-white/70 [word-break:keep-all]">복습할 오답, 약한 과목, 아직 안 푼 문제를 섞어 골랐어요.</p>
              <Link href={dailyHref} className="mt-auto self-start pt-5">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper">시작하기<ArrowRight className="size-3.5" /></span>
              </Link>
            </div>
            <Panel
              label="오답노트"
              value={review.due > 0 ? <>오늘 복습 <span className="text-clay">{review.due}</span>문제</> : review.active > 0 ? "오늘 복습 완료" : "오답 없음"}
              note={review.active > 0 ? `남은 오답 ${review.active}문제 · 3번 연속 맞히면 졸업` : "기출을 풀면 틀린 문제가 자동으로 모여요"}
              href={review.due > 0 ? "/practice" : "/review"}
              linkLabel={review.due > 0 ? "복습하기" : "오답노트 보기"}
            />
            <Panel
              label={mainCert ? `${mainCert.name} · 가장 약한 영역` : "약점 분석"}
              value={mainCert?.weakest ? <>{mainCert.weakest.title} <span className="text-clay">{mainCert.weakest.accuracy}%</span></> : mainCert ? `정답률 ${mainCert.accuracy}%` : "분석 준비 중"}
              note={mainCert ? `지금까지 ${mainCert.answered.toLocaleString("ko-KR")}문항 · 전체 정답률 ${mainCert.accuracy}%` : "회차를 풀면 과목별 정답률을 분석해 드려요"}
              href={mainCert ? `/mypage?cert=${mainCert.code}#insights` : "/mypage"}
              linkLabel="학습 분석 보기"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <SectionTitle eyebrow="기출문제" title="회차별 기출 풀기" action={{ href: "/license", label: "전체 자격증 보기" }} />
        <CertGrid certifications={certifications} loggedIn proofs={proofs} />
      </section>
    </>
  );
}
