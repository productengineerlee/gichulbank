"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, GraduationCap, RotateCcw, XCircle } from "lucide-react";
import { PromptText } from "@/components/prompt-text";
import { ExplanationView } from "@/components/explanation-view";
import type { PracticeQuestion } from "@/lib/review";

type RunnerQuestion = PracticeQuestion & { reasonLabel?: string };

type Feedback = {
  isCorrect: boolean;
  correctLabel: string;
  correctAnswer: string;
  explanation: string | null;
  review: { wrongCount: number; correctStreak: number; graduated: boolean; nextReviewAt: string | null; counted: boolean } | null;
};

type Outcome = { questionId: string; isCorrect: boolean; graduated: boolean };

interface PracticeRunnerProps {
  questions: RunnerQuestion[];
  title: string;
  mode: "review" | "daily" | "round";
  earlyPractice?: boolean;
  /** 회차 연습 이어 풀기: 시작 위치와 이미 푼 문항의 정오 */
  initialIndex?: number;
  initialOutcomes?: { questionId: string; isCorrect: boolean }[];
  /** 회차 연습을 처음부터 다시 시작하는 주소 */
  restartHref?: string;
  /** 끝난 뒤 돌아갈 곳 */
  doneHref: string;
  doneLabel: string;
}

const GRADUATION_STREAK = 3;

function reviewMessage(feedback: Feedback) {
  const review = feedback.review;
  if (!review) return null;
  if (review.graduated && review.counted && feedback.isCorrect) return "3번 연속 정답! 이 문제는 오답노트에서 졸업했어요.";
  if (!feedback.isCorrect) return "내일 다시 복습할 수 있도록 오답노트에 남겨 두었어요.";
  if (!review.counted) return "복습일 전에 푼 정답이라 연속 정답에는 반영되지 않았어요.";
  const days = review.nextReviewAt ? Math.max(1, Math.round((new Date(review.nextReviewAt).getTime() - Date.now()) / 86_400_000)) : null;
  return `연속 정답 ${review.correctStreak}/${GRADUATION_STREAK} · ${days}일 후 다시 복습해요.`;
}

export function PracticeRunner({ questions, title, mode, earlyPractice = false, initialIndex = 0, initialOutcomes = [], restartHref, doneHref, doneLabel }: PracticeRunnerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>(() => initialOutcomes.map((item) => ({ ...item, graduated: false })));
  const shownAt = useRef(0);

  const question = questions[index];
  const finished = index >= questions.length;

  // 문항이 화면에 나타난 시점부터 풀이 시간을 잰다.
  useEffect(() => { shownAt.current = performance.now(); }, [index]);

  async function submit() {
    if (!selected || submitting || feedback) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/practice/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.questionId, label: selected, timeSpentMs: performance.now() - shownAt.current, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "채점하지 못했습니다.");
      const result = data as Feedback;
      setFeedback(result);
      setOutcomes((prev) => [...prev, { questionId: question.questionId, isCorrect: result.isCorrect, graduated: Boolean(result.isCorrect && result.review?.graduated && result.review.counted) }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "채점하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setIndex((value) => value + 1);
    setSelected(null);
    setFeedback(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (finished) {
    const correct = outcomes.filter((item) => item.isCorrect).length;
    const graduated = outcomes.filter((item) => item.graduated).length;
    return <div className="practice-summary">
      <CheckCircle2 />
      <h1>{mode === "daily" ? "오늘의 추천 문제 완료!" : mode === "round" ? "연습 완료!" : "복습 완료!"}</h1>
      <p>{outcomes.length}문제 중 <b>{correct}문제</b>를 맞혔어요.</p>
      <div className="practice-summary-stats">
        <div><span>정답</span><b>{correct}</b></div>
        <div><span>오답</span><b>{outcomes.length - correct}</b></div>
        <div><span>졸업</span><b>{graduated}</b></div>
      </div>
      <div className="practice-summary-actions">
        <Link href={doneHref}>{doneLabel}</Link>
        {mode === "review" && <button type="button" onClick={() => window.location.reload()}><RotateCcw />다시 복습하기</button>}
        {mode === "round" && restartHref && <a className="secondary" href={restartHref}><RotateCcw />처음부터 다시 풀기</a>}
        {mode !== "review" && <Link className="secondary" href="/review">오답노트 보기</Link>}
      </div>
    </div>;
  }

  const message = feedback ? reviewMessage(feedback) : null;

  return <div className="practice-runner">
    <div className="practice-head">
      <div><span>{title}</span><b>{index + 1} / {questions.length}</b></div>
      <div className="practice-progress"><i style={{ width: `${(index / questions.length) * 100}%` }} /></div>
      {earlyPractice && <small>복습일 전 문제는 정답을 맞혀도 연속 정답에 반영되지 않습니다.</small>}
    </div>

    <article className="practice-card">
      <div className="review-item-meta">
        {question.reasonLabel && <span className="review-badge reason">{question.reasonLabel}</span>}
        {question.wrongCount > 0 && <span className="review-badge due">틀린 횟수 {question.wrongCount}</span>}
        {question.correctStreak > 0 && <span className="review-badge wait">연속 정답 {question.correctStreak}/{GRADUATION_STREAK}</span>}
        <span>{question.certificationName} · {question.examTitle} · {question.number}번</span>
      </div>
      <PromptText className="review-full-prompt" prompt={question.prompt} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 원본 이미지를 그대로 보여준다 */}
      {question.imageUrl && <img className="review-image" src={question.imageUrl} alt={`${question.number}번 문제 이미지`} />}

      <div className="practice-choices" role="radiogroup" aria-label="보기 선택">
        {question.choices.map((choice) => {
          const state = feedback
            ? choice.label === feedback.correctLabel ? "correct" : choice.label === selected ? "wrong" : ""
            : choice.label === selected ? "selected" : "";
          return <button type="button" role="radio" aria-checked={choice.label === selected} key={choice.label} className={state} disabled={Boolean(feedback) || submitting} onClick={() => setSelected(choice.label)}>
            <span>{choice.label}</span><p>{choice.content}</p>
            {state === "correct" && <CheckCircle2 />}{state === "wrong" && <XCircle />}
          </button>;
        })}
      </div>

      {error && <p className="practice-error">{error}</p>}

      {feedback && <div className={`practice-feedback ${feedback.isCorrect ? "correct" : "wrong"}`}>
        <div className="practice-feedback-title">
          {feedback.isCorrect ? <CheckCircle2 /> : <XCircle />}
          <b>{feedback.isCorrect ? "정답입니다!" : "틀렸어요"}</b>
          {feedback.review?.graduated && feedback.review.counted && feedback.isCorrect && <span className="review-badge done"><GraduationCap />졸업</span>}
        </div>
        {!feedback.isCorrect && <p><b>정답</b> {feedback.correctAnswer}</p>}
        {message && <p className="practice-review-note">{message}</p>}
        <ExplanationView text={feedback.explanation} correctLabel={feedback.correctLabel} selectedLabel={selected} />
      </div>}

      <div className="practice-actions">
        {feedback
          ? <button type="button" className="primary" onClick={next}>{index + 1 < questions.length ? "다음 문제" : "결과 보기"}<ArrowRight /></button>
          : <button type="button" className="primary" disabled={!selected || submitting} onClick={() => void submit()}>{submitting ? "채점 중..." : "정답 확인"}</button>}
      </div>
    </article>
  </div>;
}

