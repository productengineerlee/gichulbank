"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

const COMMENT_MAX = 300;
const ratingWords = ["", "아쉬워요", "그저 그래요", "괜찮아요", "좋아요", "최고예요"];

/** 채점 결과 화면의 회차 후기(별점 + 한 줄 평). 회차를 제출한 본인만 쓸 수 있고, 다시 쓰면 수정된다. */
export function ReviewBox({ attemptId }: { attemptId: string }) {
  const [state, setState] = useState<"loading" | "hidden" | "ready">("loading");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState<{ rating: number; comment: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reviews?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not reviewable");
        return response.json() as Promise<{ review: { rating: number; comment: string | null } | null }>;
      })
      .then(({ review }) => {
        if (cancelled) return;
        if (review) {
          setRating(review.rating);
          setComment(review.comment ?? "");
          setSaved({ rating: review.rating, comment: review.comment ?? "" });
        }
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("hidden"); });
    return () => { cancelled = true; };
  }, [attemptId]);

  if (state !== "ready") return null;

  const changed = !saved || saved.rating !== rating || saved.comment !== comment.trim();
  const shown = hover || rating;

  async function submit() {
    if (!rating || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, rating, comment }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "후기를 저장하지 못했습니다.");
      setSaved({ rating, comment: comment.trim() });
      setComment(comment.trim());
      setMessage({ type: "ok", text: saved ? "후기를 수정했어요." : "후기를 남겨 주셔서 고마워요!" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "후기를 저장하지 못했습니다." });
    } finally {
      setSaving(false);
    }
  }

  return <section className="review-box">
    <div className="review-box-head">
      <h2>{saved ? "내가 남긴 회차 후기" : "이 회차 어떠셨나요?"}</h2>
      <p>후기는 다른 수험생에게 이름 없이 보여요. 회차를 끝까지 푼 분만 남길 수 있어요.</p>
    </div>
    <div className="review-stars" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((value) => (
        <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`별 ${value}개`}
          className={value <= shown ? "on" : ""} onMouseEnter={() => setHover(value)} onClick={() => setRating(value)}>
          <Star />
        </button>
      ))}
      <span>{shown ? ratingWords[shown] : "별점을 골라 주세요"}</span>
    </div>
    <textarea value={comment} maxLength={COMMENT_MAX} rows={2} onChange={(event) => setComment(event.target.value)}
      placeholder="한 줄 평을 남겨 주세요 (선택). 예: 해설이 자세해서 오답 정리하기 좋았어요." />
    <div className="review-box-foot">
      <small>{comment.length}/{COMMENT_MAX}</small>
      {message && <span className={`review-message ${message.type}`}>{message.text}</span>}
      <button type="button" onClick={submit} disabled={!rating || saving || !changed}>{saving ? "저장 중…" : saved ? "후기 수정" : "후기 남기기"}</button>
    </div>
  </section>;
}
