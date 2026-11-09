import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/supabase/paging";
import type { PracticeQuestion } from "@/lib/review";

/**
 * 회차 연습모드의 풀이 기록은 practice_answers.mode = "random" 으로 남긴다
 * (DB 제약에 이미 있는 값이라 스키마를 바꾸지 않아도 된다).
 * 이 기록은 오답노트(review_items)와 약점 통계(insights)에 그대로 반영된다.
 */
export const ROUND_PRACTICE_MODE = "random" as const;

export type RoundPractice = {
  examTitle: string;
  certCode: string;
  certName: string;
  questions: PracticeQuestion[];
  /** 이어 풀 위치(이번 회차 연습에서 이미 푼 문항 수) */
  startIndex: number;
  /** 이어 풀기일 때 이미 푼 문항의 정오 */
  priorOutcomes: { questionId: string; isCorrect: boolean }[];
};

/** 공개된 자격증 회차의 객관식 문항을 번호 순으로 불러오고, 진행 중인 연습이 있으면 이어 풀 위치를 계산한다. 정답·해설은 넣지 않는다. */
export async function loadRoundPractice(userId: string, slug: string, restart: boolean): Promise<RoundPractice | null> {
  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("id,title,certification_id").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!exam?.certification_id) return null;
  const { data: cert } = await admin.from("certifications").select("code,name").eq("id", exam.certification_id).eq("is_active", true).maybeSingle();
  if (!cert) return null;

  const rows = await fetchAll((from, to) => admin.from("questions").select("id,number,prompt,image_url,competency_tags")
    .eq("exam_id", exam.id).eq("is_active", true).order("number").order("id").range(from, to));
  const ids = rows.map((row) => row.id);
  const [choices, reviews, answers] = await Promise.all([
    fetchByIds(ids, (chunk, from, to) => admin.from("question_choices").select("id,question_id,label,content,sort_order").in("question_id", chunk).order("question_id").order("sort_order").range(from, to)),
    fetchByIds(ids, (chunk, from, to) => admin.from("review_items").select("question_id,wrong_count,correct_streak,graduated_at").eq("user_id", userId).in("question_id", chunk).order("question_id").range(from, to)),
    fetchByIds(ids, (chunk, from, to) => admin.from("practice_answers").select("id,question_id,is_correct,answered_at").eq("user_id", userId).eq("mode", ROUND_PRACTICE_MODE).in("question_id", chunk).order("id").range(from, to)),
  ]);
  const choicesByQuestion = Map.groupBy(choices, (choice) => choice.question_id);
  const reviewByQuestion = new Map(reviews.map((review) => [review.question_id, review]));

  // 보기가 없는 문항(주관식 등)은 한 문제씩 채점할 수 없어 연습모드에서 뺀다.
  const questions: PracticeQuestion[] = rows.filter((row) => choicesByQuestion.has(row.id)).map((row) => {
    const review = reviewByQuestion.get(row.id);
    const active = review && !review.graduated_at;
    return {
      questionId: row.id,
      certificationName: cert.name,
      examTitle: exam.title,
      number: row.number,
      prompt: row.prompt,
      imageUrl: row.image_url,
      tags: row.competency_tags,
      wrongCount: active ? review.wrong_count : 0,
      correctStreak: active ? review.correct_streak : 0,
      choices: (choicesByQuestion.get(row.id) ?? []).map((choice) => ({ label: choice.label, content: choice.content })),
    };
  });

  // 연습 한 판은 첫 문항을 풀 때 시작한다. 가장 최근에 첫 문항을 푼 뒤의 기록을 이번 판으로 보고 이어 푼다.
  let startIndex = 0;
  let priorOutcomes: RoundPractice["priorOutcomes"] = [];
  const first = questions[0];
  if (!restart && first) {
    const runStart = answers.filter((answer) => answer.question_id === first.questionId).map((answer) => answer.answered_at).sort().at(-1);
    if (runStart) {
      const latestByQuestion = new Map<string, boolean>();
      for (const answer of answers.filter((item) => item.answered_at >= runStart).sort((a, b) => a.answered_at.localeCompare(b.answered_at))) {
        latestByQuestion.set(answer.question_id, answer.is_correct);
      }
      // 문항 순서대로 끊김 없이 푼 곳까지만 이어 푼다.
      while (startIndex < questions.length && latestByQuestion.has(questions[startIndex].questionId)) startIndex += 1;
      priorOutcomes = questions.slice(0, startIndex).map((question) => ({ questionId: question.questionId, isCorrect: latestByQuestion.get(question.questionId) ?? false }));
    }
  }

  return { examTitle: exam.title, certCode: cert.code, certName: cert.name, questions, startIndex, priorOutcomes };
}
