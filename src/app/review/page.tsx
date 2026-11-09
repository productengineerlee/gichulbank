import Link from "next/link";
import { redirect } from "next/navigation";
import { BookX, CheckCircle2, RotateCcw } from "lucide-react";
import { ExamHeader } from "@/components/exams/exam-header";
import { createClient } from "@/lib/supabase/server";
import { ExplanationView } from "@/components/explanation-view";
import { PromptText } from "@/components/prompt-text";
import { loadReviewNotebook, PRACTICE_SESSION_SIZE, type ReviewFilter, type ReviewItem } from "@/lib/review";
import "../exams/exams.css";
import "./review.css";

export const dynamic = "force-dynamic";

const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: "all", label: "전체 오답" },
  { value: "due", label: "오늘 복습" },
  { value: "graduated", label: "졸업한 문제" },
];

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function reviewBadge(item: ReviewItem) {
  if (item.graduatedAt) return <span className="review-badge done">졸업</span>;
  if (item.isDue) return <span className="review-badge due">오늘 복습</span>;
  const days = Math.ceil((new Date(item.nextReviewAt).getTime() - Date.now()) / 86_400_000);
  return <span className="review-badge wait">{days}일 후 복습</span>;
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ cert?: string; filter?: string; page?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/review");

  const filter: ReviewFilter = query.filter === "due" || query.filter === "graduated" ? query.filter : "all";
  const notebook = await loadReviewNotebook(user.id, String(query.cert ?? ""), filter, Number(query.page ?? 1));
  const href = (next: { cert?: string; filter?: ReviewFilter; page?: number }) => {
    const params = new URLSearchParams();
    const cert = next.cert ?? notebook.selectedCert;
    const nextFilter = next.filter ?? notebook.filter;
    if (cert) params.set("cert", cert);
    if (nextFilter !== "all") params.set("filter", nextFilter);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return qs ? `/review?${qs}` : "/review";
  };
  const practiceHref = (scope: "due" | "all") => `/practice?${new URLSearchParams({ ...(notebook.selectedCert && { cert: notebook.selectedCert }), ...(scope === "all" && { scope }) })}`;
  const totalActive = notebook.certifications.reduce((sum, cert) => sum + cert.count, 0);

  return <main className="exam-app">
    <ExamHeader />
    <section className="exam-container review-container">
      <div className="exam-titlebar">
        <div><span>틀린 문제 복습</span><h1>오답노트</h1></div>
        <p>회차 기출에서 틀린 문제가 자동으로 모입니다. 복습일(1·3·7일 간격)에 다시 풀고, 3번 연속 맞히면 졸업합니다.</p>
      </div>

      {notebook.certifications.length === 0 ? (
        <div className="review-empty">
          <BookX />
          <h2>아직 오답이 없습니다</h2>
          <p>기출 회차를 풀고 제출하면 틀린 문제가 이곳에 자동으로 저장됩니다.</p>
          <Link href="/license">기출문제 풀러 가기</Link>
        </div>
      ) : <>
        <nav className="review-cert-tabs" aria-label="자격증 선택">
          <Link className={!notebook.selectedCert ? "active" : ""} href={href({ cert: "", page: 1 })}>전체 <b>{totalActive}</b></Link>
          {notebook.certifications.map((cert) => <Link key={cert.code} className={notebook.selectedCert === cert.code ? "active" : ""} href={href({ cert: cert.code, page: 1 })}>{cert.name} <b>{cert.count}</b></Link>)}
        </nav>

        <section className="review-summary">
          <article><div><span>남은 오답</span><strong>{notebook.counts.active}<small>문제</small></strong></div></article>
          <article className="accent"><div><span>오늘 복습할 문제</span><strong>{notebook.counts.due}<small>문제</small></strong></div></article>
          <article><div><span>졸업한 문제</span><strong>{notebook.counts.graduated}<small>문제</small></strong></div></article>
          <div className="review-practice-cta">
            {notebook.counts.due > 0
              ? <Link href={practiceHref("due")}><RotateCcw />오늘 복습 {Math.min(notebook.counts.due, PRACTICE_SESSION_SIZE)}문제 풀기</Link>
              : notebook.counts.active > 0
                ? <Link className="ghost" href={practiceHref("all")}><RotateCcw />남은 오답 미리 풀기</Link>
                : <button type="button" disabled><RotateCcw />복습할 문제가 없어요</button>}
            <small>{notebook.counts.due > PRACTICE_SESSION_SIZE ? `한 번에 ${PRACTICE_SESSION_SIZE}문제씩 복습합니다` : "한 문제씩 풀고 바로 정답을 확인해요"}</small>
          </div>
        </section>

        <nav className="review-filter" aria-label="오답 필터">
          {FILTERS.map((item) => <Link key={item.value} className={notebook.filter === item.value ? "active" : ""} href={href({ filter: item.value, page: 1 })}>{item.label}</Link>)}
        </nav>

        {notebook.items.length === 0 ? (
          <div className="review-empty small"><CheckCircle2 /><p>{notebook.filter === "due" ? "오늘 복습할 문제가 없습니다." : notebook.filter === "graduated" ? "아직 졸업한 문제가 없습니다." : "남은 오답이 없습니다."}</p></div>
        ) : (
          <div className="review-list">
            {notebook.items.map((item) => <details className="review-item" key={item.questionId}>
              <summary>
                <div className="review-item-meta">
                  {reviewBadge(item)}
                  <span>{item.certificationName} · {item.examTitle} · {item.number}번</span>
                </div>
                <p className="review-item-prompt">{item.prompt}</p>
                <div className="review-item-stats"><b>틀린 횟수 {item.wrongCount}</b><span>마지막 오답 {shortDate(item.lastWrongAt)}</span>{item.correctStreak > 0 && <span>연속 정답 {item.correctStreak}/3</span>}</div>
              </summary>
              <div className="review-item-body">
                <PromptText className="review-full-prompt" prompt={item.prompt} />
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 원본 이미지를 그대로 보여준다 */}
                {item.imageUrl && <img className="review-image" src={item.imageUrl} alt={`${item.number}번 문제 이미지`} loading="lazy" />}
                {item.choices.length > 0 && <ol className="review-choices">
                  {item.choices.map((choice) => <li key={choice.label} className={choice.isCorrect ? "correct" : ""}><span>{choice.label}</span><p>{choice.content}</p>{choice.isCorrect && <CheckCircle2 />}</li>)}
                </ol>}
                <div className="review-answer"><b>정답</b><span>{item.correctAnswer}</span></div>
                <ExplanationView text={item.explanation} />
                {item.tags.length > 0 && <div className="review-tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
              </div>
            </details>)}
          </div>
        )}

        {notebook.totalPages > 1 && <nav className="pagination review-pagination">
          <Link className={notebook.currentPage === 1 ? "disabled" : ""} href={href({ page: notebook.currentPage - 1 })}>이전</Link>
          {Array.from({ length: notebook.totalPages }, (_, index) => index + 1).map((page) => <Link key={page} className={page === notebook.currentPage ? "active" : ""} href={href({ page })}>{page}</Link>)}
          <Link className={notebook.currentPage === notebook.totalPages ? "disabled" : ""} href={href({ page: notebook.currentPage + 1 })}>다음</Link>
        </nav>}
      </>}
    </section>
  </main>;
}
