import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, Clock3, FileQuestion, Star } from "lucide-react";
import { ExamHeader } from "@/components/exams/exam-header";
import { ProofLine } from "@/components/home/home-parts";
import { RoundQuestionStats } from "@/components/license/round-question-stats";
import { getCertification } from "@/lib/certifications";
import { getCertificationStats, getWrongAnswerNotebook } from "@/lib/license-stats";
import { promptPreview } from "@/lib/format-prompt";
import { getCertificationProofs, getCertificationReviews } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/server";
import "../../exams/exams.css";
import "../license.css";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "미정";
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default async function LicenseDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cert = await getCertification(code);
  if (!cert) notFound();
  // 비고가 하나라도 있을 때만 일정표에 비고 칸을 보여 준다.
  const hasScheduleMemo = cert.schedules.some((schedule) => schedule.memo);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [stats, wrongAnswers, proofs, reviews] = await Promise.all([
    getCertificationStats(cert.id),
    user ? getWrongAnswerNotebook(user.id, cert.id) : Promise.resolve([]),
    getCertificationProofs([cert.id]),
    getCertificationReviews(cert.id),
  ]);
  const proof = proofs[cert.id];
  // cert.exams는 published_at 순으로 정렬되어 있으므로, "문제풀이 시작" 목록과 같은 순서로 탭이 보이게 그 순서를 따른다.
  const roundStatsBySlug = new Map(stats.roundStats.map((round) => [round.examSlug, round]));
  const roundStats = cert.exams.map((exam) => roundStatsBySlug.get(exam.slug)).filter((round) => round !== undefined);

  return (
    <main className="exam-app">
      <ExamHeader />
      <section className="license-shell">
        <Link className="license-back" href="/license"><ArrowLeft size={15} />목록으로</Link>

        <div className="license-hero">
          <span className="kind-pill quiz">자격증 문제풀이</span>
          <h1>{cert.name}</h1>
          {cert.description && <p>{cert.description}</p>}
          <ProofLine proof={proof} className="mt-4" />
        </div>

        <section className="license-section">
          <div className="license-section-head"><h2>시험 일정</h2></div>
          {cert.schedules.length === 0 ? (
            <p className="schedule-empty">등록된 시험 일정이 없습니다.</p>
          ) : (
            <div className={`schedule-table${hasScheduleMemo ? " with-memo" : ""}`}>
              <div className="schedule-row head"><span>회차</span><span>시험일</span><span>시험시간</span><span>접수기간</span>{hasScheduleMemo && <span>비고</span>}</div>
              {cert.schedules.map((schedule) => (
                <div className="schedule-row" key={schedule.id}>
                  <span>{schedule.roundName}</span>
                  <span>{formatDate(schedule.examDate)}</span>
                  <span>{schedule.notes ?? "-"}</span>
                  <span>{schedule.applyStart && schedule.applyEnd ? `${formatDate(schedule.applyStart)} ~ ${formatDate(schedule.applyEnd)}` : "미정"}</span>
                  {hasScheduleMemo && <span className="schedule-memo">{schedule.memo ?? "-"}</span>}
                </div>
              ))}
            </div>
          )}
        </section>

        {stats.sectionStats.length > 0 && (
          <section className="license-section">
            <div className="license-section-head"><h2>출제범위별 전체 통계</h2><p>지금까지 총 <b className="respondent-count">{stats.respondentCount.toLocaleString()}명</b> 응시자들의 정답률 통계데이터입니다.</p></div>
            <div className="section-bars">
              {stats.sectionStats.map((section) => (
                <div key={section.code}>
                  <b>{section.accuracy}<small>%</small></b>
                  <div className="bar-track"><i style={section.accuracy > 0 ? { height: `${Math.max(section.accuracy, 4)}%` } : { height: 0 }} /></div>
                  <span>{section.title}<small>{section.questionCount}문항</small></span>
                </div>
              ))}
            </div>
          </section>
        )}

        {roundStats.length > 0 && (
          <section className="license-section">
            <div className="license-section-head"><h2>회차별 문항 정답 현황</h2><p>회차를 선택하면 그 회차 전체 문항의 정답률을 문항 번호 순으로 보여줍니다.</p></div>
            <RoundQuestionStats rounds={roundStats} />
          </section>
        )}

        {stats.hardestQuestions.length > 0 && (
          <details className="license-accordion">
            <summary><div className="license-section-head"><h2>가장 많이 틀린 문항</h2></div><ChevronDown /></summary>
            <div className="accordion-body">
              {stats.sectionStats.map((section) => {
                const items = stats.hardestQuestions.filter((question) => question.sectionCode === section.code);
                if (!items.length) return null;
                return (
                  <div className="stat-group" key={section.code}>
                    <h3>{section.title}</h3>
                    <div className="hardest-list">
                      {items.map((question) => (
                        <div className="hardest-row" key={question.questionId}>
                          <p>{promptPreview(question.prompt)}<small>{question.examTitle} · {question.number}번 · 응시 {question.attemptCount}회</small></p>
                          <b>{question.accuracy}%</b>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <section className="license-section">
          <div className="license-section-head"><h2>문제풀이 시작</h2></div>
          <div className="license-exam-grid">
            {cert.exams.map((exam) => (
              <article className="license-exam-card" key={exam.slug}>
                <h3>{exam.title}</h3>
                <div className="catalog-meta"><span><Clock3 />{exam.durationMinutes}분</span><span><FileQuestion />{exam.questionCount}문항</span></div>
                <div className="license-exam-modes">
                  <Link className="practice" href={`/exams/${exam.slug}/practice`}><b>연습모드</b><small>한 문제씩 바로 정답·해설</small></Link>
                  <Link href={`/exams/${exam.slug}/take`}><b>시험모드</b><small>제한시간 · 다 풀고 채점</small></Link>
                  <Link className="explain" href={`/exams/${exam.slug}/explanation`}><b>해설 보기</b><small>문항별 정답·보기별 해설</small></Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {proof?.ratingAverage != null && reviews.length > 0 && (
          <section className="license-section">
            <div className="license-section-head"><h2>수험생 후기</h2><p>회차를 끝까지 푼 수험생이 남긴 후기예요. 평균 <b className="respondent-count">★ {proof.ratingAverage.toFixed(1)}</b> · 후기 {proof.ratingCount.toLocaleString()}개</p></div>
            <div className="review-list">
              {reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <div className="review-card-top">
                    <span className="review-card-stars" aria-label={`별 ${review.rating}개`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} className={value <= review.rating ? "on" : ""} aria-hidden />)}</span>
                    <b>{review.rating}.0</b>
                    <em>회차 완료 후 작성</em>
                  </div>
                  <p>{review.comment}</p>
                  <small>{review.examTitle} · {formatDate(review.createdAt)}</small>
                </article>
              ))}
            </div>
          </section>
        )}

        {user && wrongAnswers.length > 0 && (
          <details className="license-accordion">
            <summary><div className="license-section-head"><h2>내 오답노트</h2><p>과목별로 묶어 최근 응시에서 틀린 문항 {wrongAnswers.length}개를 보여줍니다.</p></div><ChevronDown /></summary>
            <div className="accordion-body">
              {stats.sectionStats.map((section) => {
                const items = wrongAnswers.filter((item) => item.sectionCode === section.code);
                if (!items.length) return null;
                return (
                  <div className="stat-group" key={section.code}>
                    <h3>{section.title}</h3>
                    <div className="notebook-list">
                      {items.map((item, index) => (
                        <article className="notebook-card" key={`${item.attemptId}-${item.number}-${index}`}>
                          <p>{item.number}. {promptPreview(item.prompt)}</p>
                          <div className="notebook-meta">
                            <span className="wrong">내 답 {item.selectedLabel ? `${item.selectedLabel}번` : "미응답"}</span>
                            <span className="correct">정답 {item.correctLabel ? `${item.correctLabel}번` : "-"}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>
    </main>
  );
}
