import "server-only";

import { unstable_cache } from "next/cache";
import { getCertificationStats } from "@/lib/license-stats";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/paging";
import { listAdminUserIds } from "@/lib/stats-exclusion";

// 회차 후기(별점 + 한 줄 평)와 자격증 카드에 붙이는 응시자 수·평균 별점.
// 숫자가 너무 적으면 오히려 "아무도 안 푸는 곳"처럼 보이므로 기준 이상일 때만 공개한다.
export const RESPONDENT_MIN = 30;
export const REVIEW_MIN = 5;
export const REVIEW_COMMENT_MAX = 300;
export const REVIEWS_TAG = "exam_reviews";

export type CertificationProof = { respondentCount: number | null; ratingAverage: number | null; ratingCount: number };
export type PublicReview = { id: string; rating: number; comment: string; examTitle: string; createdAt: string };
export type MyReview = { rating: number; comment: string | null };

type ReviewRow = { id: string; user_id: string; certification_id: string; exam_id: string; rating: number; comment: string | null; created_at: string };

/** 공개 대상 후기: 숨기지 않았고 관리자 계정이 쓴 것이 아닌 후기. 표가 아직 없으면(마이그레이션 전) 빈 목록. */
async function loadVisibleReviews(): Promise<ReviewRow[]> {
  const admin = createAdminClient();
  try {
    const [rows, adminIds] = await Promise.all([
      fetchAll<ReviewRow>((from, to) => admin.from("exam_reviews").select("id,user_id,certification_id,exam_id,rating,comment,created_at")
        .eq("is_hidden", false).order("created_at", { ascending: false }).order("id").range(from, to), "후기를 불러오지 못했습니다."),
      listAdminUserIds(),
    ]);
    const excluded = new Set(adminIds);
    return rows.filter((row) => !excluded.has(row.user_id));
  } catch (error) {
    console.error("[reviews] 후기 조회 실패", error);
    return [];
  }
}

const roundRating = (value: number) => Math.round(value * 10) / 10;

/** 자격증별 응시자 수(기준 미만이면 null)와 평균 별점(후기 기준 미만이면 null). 10분 캐시. */
export const getCertificationProofs = unstable_cache(
  async (certificationIds: string[]): Promise<Record<string, CertificationProof>> => {
    const [reviews, respondents] = await Promise.all([
      loadVisibleReviews(),
      Promise.all(certificationIds.map(async (id) => {
        try { return [id, (await getCertificationStats(id)).respondentCount] as const; }
        catch { return [id, 0] as const; }
      })),
    ]);
    const proofs: Record<string, CertificationProof> = {};
    for (const [id, respondentCount] of respondents) {
      const ratings = reviews.filter((review) => review.certification_id === id).map((review) => review.rating);
      proofs[id] = {
        respondentCount: respondentCount >= RESPONDENT_MIN ? respondentCount : null,
        ratingAverage: ratings.length >= REVIEW_MIN ? roundRating(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : null,
        ratingCount: ratings.length,
      };
    }
    return proofs;
  },
  ["certification-proofs"],
  { revalidate: 600, tags: [REVIEWS_TAG] },
);

/** 자격증 상세 페이지용 최근 후기(한 줄 평이 있는 것만). 후기가 기준 미만이면 빈 목록. */
export async function getCertificationReviews(certificationId: string, limit = 6): Promise<PublicReview[]> {
  const reviews = (await loadVisibleReviews()).filter((review) => review.certification_id === certificationId);
  if (reviews.length < REVIEW_MIN) return [];
  const withComment = reviews.filter((review) => review.comment?.trim()).slice(0, limit);
  if (!withComment.length) return [];
  const admin = createAdminClient();
  const { data: exams } = await admin.from("exams").select("id,title").in("id", [...new Set(withComment.map((review) => review.exam_id))]);
  const titleById = new Map((exams ?? []).map((exam) => [exam.id, exam.title]));
  return withComment.map((review) => ({
    id: review.id, rating: review.rating, comment: review.comment!.trim(),
    examTitle: titleById.get(review.exam_id) ?? "", createdAt: review.created_at,
  }));
}

export class ReviewError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** 이 응시로 후기를 쓸 수 있는지(본인 응시·채점 완료·자격증 회차) 확인하고 회차 정보를 돌려준다. */
async function reviewableAttempt(userId: string, attemptId: string) {
  const admin = createAdminClient();
  const { data: attempt } = await admin.from("attempts").select("id,user_id,exam_id,status").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== userId) throw new ReviewError("응시 기록을 찾을 수 없습니다.", 404);
  if (attempt.status !== "graded" && attempt.status !== "submitted") throw new ReviewError("회차를 제출한 뒤에 후기를 남길 수 있어요.", 400);
  const { data: exam } = await admin.from("exams").select("id,certification_id").eq("id", attempt.exam_id).maybeSingle();
  if (!exam?.certification_id) throw new ReviewError("후기를 남길 수 없는 시험입니다.", 400);
  return { attemptId: attempt.id, examId: exam.id, certificationId: exam.certification_id };
}

export async function getMyReview(userId: string, attemptId: string): Promise<MyReview | null> {
  const { examId } = await reviewableAttempt(userId, attemptId);
  const admin = createAdminClient();
  const { data, error } = await admin.from("exam_reviews").select("rating,comment").eq("user_id", userId).eq("exam_id", examId).maybeSingle();
  if (error) throw new ReviewError("후기를 불러오지 못했습니다.", 500);
  return data ? { rating: data.rating, comment: data.comment } : null;
}

export async function saveMyReview(userId: string, attemptId: string, rating: number, comment: string | null): Promise<MyReview> {
  const target = await reviewableAttempt(userId, attemptId);
  const admin = createAdminClient();
  const { error } = await admin.from("exam_reviews").upsert({
    user_id: userId, certification_id: target.certificationId, exam_id: target.examId, attempt_id: target.attemptId,
    rating, comment, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,exam_id" });
  if (error) {
    console.error("[reviews] 후기 저장 실패", error);
    throw new ReviewError("후기를 저장하지 못했습니다.", 500);
  }
  return { rating, comment };
}
