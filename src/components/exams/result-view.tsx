"use client";
/* eslint-disable react-hooks/set-state-in-effect -- result is restored from browser storage after hydration. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BarChart3, BookX, CheckCircle2, ChevronDown, Home, XCircle } from "lucide-react";
import type { GradingResult } from "@/lib/grading";
import { levelLabel } from "@/lib/diagnostic-level";
import { promptPreview } from "@/lib/format-prompt";
import { examSource } from "@/lib/exam-source";
import { ExplanationView } from "@/components/explanation-view";

function Radar({ values, labels }: { values: number[]; labels: string[] }) {
  const c = 100, r = 60, n = values.length;
  const point = (i: number, p: number) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return { x: c + Math.cos(a) * r * p / 100, y: c + Math.sin(a) * r * p / 100 };
  };
  const labelPos = (i: number) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const anchor: "start" | "end" | "middle" = cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";
    const dy = sinA > 0.3 ? 9 : sinA < -0.3 ? -3 : 4;
    return { x: c + cosA * (r + 16), y: c + sinA * (r + 16) + dy, anchor };
  };
  const ringPoints = (p: number) => values.map((_, i) => { const { x, y } = point(i, p); return `${x},${y}`; }).join(" ");
  const valuePoints = values.map((v, i) => { const { x, y } = point(i, v); return `${x},${y}`; }).join(" ");
  return <svg className="radar" viewBox="-20 0 240 200">
    {[25, 50, 75, 100].map(v => <polygon key={v} points={ringPoints(v)} className="radar-ring" />)}
    {values.map((_, i) => { const axis = point(i, 100); return <line key={i} x1={c} y1={c} x2={axis.x} y2={axis.y} className="radar-axis" />; })}
    <polygon points={valuePoints} className="radar-value" />
    {values.map((v, i) => { const { x, y } = point(i, v); return <circle key={i} cx={x} cy={y} r="3" className="radar-dot" />; })}
    {labels.map((label, i) => { const p = labelPos(i); return <text key={i} x={p.x} y={p.y} textAnchor={p.anchor} className="radar-axis-label">{label}</text>; })}
  </svg>;
}

function legacyComment(p: number) {
  if (p >= 80) return "안정적으로 이해하고 있습니다. 실전 시간 관리와 고난도 문항에 집중하세요.";
  if (p >= 60) return "기본기는 갖추었지만 복합 조건과 결과 해석을 조금 더 연습하세요.";
  if (p >= 40) return "핵심 개념은 일부 이해했습니다. 오답 해설과 같은 유형을 반복해 보세요.";
  return "기초 개념부터 다시 정리하고 같은 유형의 기출문제를 반복해 보세요.";
}

export function ResultView({ slug }: { slug: string }) {
  const [result, setResult] = useState<GradingResult | null>(null);
  const [open, setOpen] = useState<number[]>([]);
  const [competencyOpen, setCompetencyOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const attemptId = new URLSearchParams(window.location.search).get("attemptId");
    try {
      const cached = localStorage.getItem(`exam-result:${slug}:latest`);
      if (cached) {
        const parsedCached = JSON.parse(cached) as GradingResult;
        // Only trust the cache if it's for the attempt actually being requested — otherwise a
        // stale cached result from a different attempt could flash (or, if the refetch below
        // fails, permanently stick) under this attempt's URL.
        if (!attemptId || parsedCached.id === attemptId) setResult(parsedCached);
      }
    } catch {}
    const query = attemptId ? `?attemptId=${encodeURIComponent(attemptId)}` : "";
    fetch(`/api/exams/${slug}/result${query}`, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("result unavailable"); return response.json() as Promise<GradingResult>; })
      .then(remote => { if (cancelled) return; setResult(remote); setLoadError(false); localStorage.setItem(`exam-result:${slug}:latest`, JSON.stringify(remote)); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const sectionDiagnostics = useMemo(() => new Map(result?.diagnostics?.sections?.map(item => [item.code, item]) ?? []), [result]);
  const weakestSection = useMemo(() => result?.diagnostics?.sections ? [...result.diagnostics.sections].sort((a, b) => a.percentage - b.percentage)[0] : null, [result]);
  const weakestCompetency = result?.diagnostics?.competencies?.[0] ?? null;

  if (!result) return <main className="result-empty"><BarChart3 /><h1>{loading ? "채점 결과를 불러오는 중입니다" : loadError ? "결과를 불러오지 못했습니다" : "채점 결과가 없습니다"}</h1><p>{loading ? "잠시만 기다려 주세요." : loadError ? "네트워크 상태를 확인하고 새로고침해 주세요." : "모의고사를 제출하면 결과가 이곳에 표시됩니다."}</p><Link href="/license">기출문제 목록으로 돌아가기</Link></main>;

  const reviewSavedCount = result.certificationCode ? result.questions.filter((question) => !question.isCorrect && question.userAnswer.trim() !== "").length : 0;
  const listHref = result.certificationCode ? `/license/${result.certificationCode}` : "/license";
  const scoreNote = result.certificationCode === "korean-history"
    ? <p className="score-note">※ 배점은 100점만으로 문항별 1점~3점 차등배점을 기준으로 채점하였습니다.</p>
    : <p className="score-note">※ 표시되는 점수와 합격 여부는 학습 참고용이며, 실제 시험의 공식 결과와 다를 수 있습니다.</p>;

  return <main className="result-page">
    <header className={result.passed ? "pass" : "fail"}><div className="result-head-inner"><div className="result-head-links"><Link href={listHref}><ArrowLeft />회차 목록</Link><Link href="/"><Home />홈가기</Link></div><div className="result-status">{result.passed ? <CheckCircle2 /> : <XCircle />}<span>{result.passed ? "모의 합격" : "모의 불합격"}</span></div><h1>{result.examTitle}</h1><p>제출 즉시 자동채점한 결과입니다.</p><div className="total-score"><b>{result.totalScore}</b><span>/ {result.maxScore}점</span></div><div className="score-meta"><span>합격 기준 {result.passingScore}점</span><span>정답 {result.correctCount}/{result.questionCount}</span><span>응답 {result.answeredCount}/{result.questionCount}</span></div>{scoreNote}</div></header>
    <section className="result-container">{reviewSavedCount > 0 && <Link className="review-saved-note" href={`/review?cert=${result.certificationCode}`}><BookX /><span>틀린 문제 <b>{reviewSavedCount}개</b>가 오답노트에 저장됐어요</span><em>오답노트 보기<ArrowRight /></em></Link>}
      <div className="result-grid">
        <article className="result-card"><h2>영역별 점수</h2><div className="section-bars">{result.sections.map(section => <div key={section.code}><b>{section.earnedScore}<small>/{section.maxScore}</small></b><div className="bar-track"><i style={section.percentage > 0 ? { height: `${Math.max(section.percentage, 4)}%` } : { height: 0 }} /></div><span>{section.title}</span></div>)}</div></article>
        <article className="result-card radar-card"><h2>영역별 역량 균형</h2><Radar values={result.sections.map(section => section.percentage)} labels={result.sections.map(section => section.title)} /><div className="radar-labels">{result.sections.map(section => <span key={section.code}>{section.title}<b>{section.percentage}%</b></span>)}</div></article>
      </div>

      <section className="competency-section"><div className="diagnostic-heading"><div><h2>영역별 진단</h2><p>영역별 정답과 배점을 기준으로 강점과 보강 방법을 안내합니다.</p></div></div><div className="competency-grid">{result.sections.map(section => { const diagnostic = sectionDiagnostics.get(section.code); const level = diagnostic?.level ?? "developing"; return <article className={`competency-card level-${level}`} key={section.code}><div className="competency-top"><div><span>{levelLabel[level]}</span><h3>{section.title}</h3></div><b>{section.percentage}<small>%</small></b></div><div className="competency-meter"><i style={{ width: `${section.percentage}%` }} /></div><small className="competency-count">정답 {section.correctCount}/{section.questionCount} · {section.earnedScore}/{section.maxScore}점</small><p>{diagnostic?.comment ?? legacyComment(section.percentage)}</p><p className="action-line"><b>보강 방법</b>{diagnostic?.recommendation ?? "오답 해설을 확인하고 같은 유형을 다시 풀어보세요."}</p></article>; })}</div></section>

      {weakestSection && <article className="coach-card"><span>개인별 우선 보강</span><h2>{weakestSection.title}{weakestCompetency ? ` · ${weakestCompetency.title}` : ""}</h2><p>{weakestSection.comment}</p><strong>{weakestSection.recommendation}</strong>{weakestCompetency && <p className="competency-coach"><b>{weakestCompetency.title} {weakestCompetency.percentage}%</b> — {weakestCompetency.recommendation}</p>}</article>}

      {!!result.diagnostics?.competencies?.length && <section className="competency-section"><div className="diagnostic-heading"><div><h2>세부 역량 진단</h2><p>문항에 연결된 역량 태그별 정답과 배점을 기준으로 분석했습니다.</p></div><button className="diagnostic-toggle" onClick={() => setCompetencyOpen(v => !v)}>{competencyOpen ? "접기" : "자세히 보기"}<ChevronDown className={competencyOpen ? "rotate" : ""} /></button></div>{competencyOpen && <div className="competency-grid">{result.diagnostics.competencies.map(item => <article className={`competency-card level-${item.level}`} key={item.code}><div className="competency-top"><div><span>{levelLabel[item.level]}</span><h3>{item.title}</h3></div><b>{item.percentage}<small>%</small></b></div><div className="competency-meter"><i style={{ width: `${item.percentage}%` }} /></div><small className="competency-count">정답 {item.correctCount}/{item.questionCount} · {item.earnedScore}/{item.maxScore}점</small><p>{item.comment}</p><p className="action-line"><b>보강 방법</b>{item.recommendation}</p></article>)}{examSource(slug) && <p className="exam-source-note">{examSource(slug)?.text}</p>}</div>}</section>}

      <div className="review-heading"><div><h2>문항별 결과와 해설</h2></div><button className="diagnostic-toggle" onClick={() => setReviewOpen(v => !v)}>{reviewOpen ? "접기" : "자세히 보기"}<ChevronDown className={reviewOpen ? "rotate" : ""} /></button></div>
      {reviewOpen && <div className="review-list">{result.questions.map(question => <article className={question.isCorrect ? "correct" : "wrong"} key={question.number}><button onClick={() => setOpen(current => current.includes(question.number) ? current.filter(number => number !== question.number) : [...current, question.number])}><span className="result-icon">{question.isCorrect ? <CheckCircle2 /> : <XCircle />}</span><span className="review-title"><b>문제 {question.number}</b><small>{promptPreview(question.prompt)}</small></span><span className="review-score">{question.awardedScore} / {question.maxScore}점</span><ChevronDown className={open.includes(question.number) ? "rotate" : ""} /></button>{open.includes(question.number) && <div className="review-detail">{question.imageUrl && <div className="explanation"><img className="review-image" src={question.imageUrl} alt={`문제 ${question.number} 참고 이미지`}/></div>}<div><span>내 답안</span><p>{question.userAnswerDisplay}</p></div><div><span>정답</span><p>{question.correctAnswer}</p></div><div className="explanation"><span>해설</span><ExplanationView text={question.explanation} heading={false} /></div></div>}</article>)}</div>}
    </section>
  </main>;
}