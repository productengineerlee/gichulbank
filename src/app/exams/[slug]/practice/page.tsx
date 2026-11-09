import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExamHeader } from "@/components/exams/exam-header";
import { PracticeRunner } from "@/components/practice/practice-runner";
import { examSource } from "@/lib/exam-source";
import { loadRoundPractice } from "@/lib/round-practice";
import { createClient } from "@/lib/supabase/server";
import "../../exams.css";
import "../../../review/review.css";
import "../../../practice/practice.css";

export const dynamic = "force-dynamic";

/** 회차 연습모드: 시간 제한 없이 한 문제씩 풀고 바로 정답·해설을 확인한다. */
export default async function RoundPracticePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ restart?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/exams/${slug}/practice`)}`);

  const round = await loadRoundPractice(user.id, slug, query.restart === "1");
  if (!round) notFound();

  return <main className="exam-app">
    <ExamHeader />
    <section className="exam-container practice-container">
      {round.questions.length ? <PracticeRunner
        questions={round.questions}
        title={`${round.examTitle} · 연습모드${round.startIndex > 0 && round.startIndex < round.questions.length ? " (이어 풀기)" : ""}`}
        mode="round"
        initialIndex={round.startIndex}
        initialOutcomes={round.priorOutcomes}
        restartHref={`/exams/${slug}/practice?restart=1`}
        doneHref={`/license/${round.certCode}`}
        doneLabel="자격증 페이지로 돌아가기"
      /> : <div className="review-empty">
        <h2>연습할 문항이 없습니다</h2>
        <p>이 회차에는 한 문제씩 채점할 수 있는 객관식 문항이 없습니다.</p>
        <Link href={`/license/${round.certCode}`}>돌아가기</Link>
      </div>}
      {examSource(slug) && <p className="exam-source-note">{examSource(slug)?.text}</p>}
    </section>
  </main>;
}
