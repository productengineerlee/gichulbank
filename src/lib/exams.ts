import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { inList, listAdminAttemptIds, listAdminUserIds } from "@/lib/stats-exclusion";
import type { ExamKind } from "@/types/database";

export type ExamSummary = {
  slug: string;
  title: string;
  kind: ExamKind;
  durationMinutes: number;
  passingScore: number;
  questionCount: number;
  sections: { code: string; title: string; count: number; score: number }[];
};
export type PublicQuestion = {
  number: number;
  type: string;
  section: string;
  competencyTags: string[];
  prompt: string;
  imageUrl: string | null;
  choices: { id: string; label: string; content: string }[];
  score: number;
  answerFormatHint?: string | null;
};
export type PublicExam = ExamSummary & { questions: PublicQuestion[] };

export async function getExam(slug: string): Promise<PublicExam | null> {
  const admin = createAdminClient();
  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("id,slug,title,kind,duration_minutes,passing_score")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (examError) throw new Error("시험을 불러오지 못했습니다.");
  if (!exam) return null;

  const [{ data: sections, error: sectionError }, { data: questions, error: questionError }] = await Promise.all([
    admin.from("exam_sections").select("id,code,title,max_score,sort_order").eq("exam_id", exam.id).order("sort_order"),
    admin.from("questions").select("id,section_id,number,type,prompt,image_url,score,difficulty,competency_tags,answer_format_hint").eq("exam_id", exam.id).eq("is_active", true).order("number"),
  ]);
  if (sectionError || questionError || !sections || !questions) throw new Error("문항 구성을 불러오지 못했습니다.");

  const questionIds = questions.map((question) => question.id);
  const { data: choices, error: choiceError } = questionIds.length
    ? await admin.from("question_choices").select("id,question_id,label,content,sort_order").in("question_id", questionIds).order("sort_order")
    : { data: [], error: null };
  if (choiceError || !choices) throw new Error("문항 보기를 불러오지 못했습니다.");

  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const publicQuestions: PublicQuestion[] = questions.map((question) => ({
    number: question.number,
    type: question.type,
    section: sectionById.get(question.section_id)?.code ?? "",
    competencyTags: question.competency_tags,
    prompt: question.prompt,
    imageUrl: question.image_url,
    choices: choices.filter((choice) => choice.question_id === question.id).map((choice) => ({
      id: `${question.number}:${choice.label}`,
      label: choice.label,
      content: choice.content,
    })),
    score: Number(question.score),
    answerFormatHint: question.answer_format_hint,
  }));

  return {
    slug: exam.slug,
    title: exam.title,
    kind: exam.kind,
    durationMinutes: exam.duration_minutes,
    passingScore: Number(exam.passing_score),
    questionCount: publicQuestions.length,
    sections: sections.map((section) => ({
      code: section.code,
      title: section.title,
      count: questions.filter((question) => question.section_id === section.id).length,
      score: Number(section.max_score),
    })),
    questions: publicQuestions,
  };
}

export type SiteStats = { attemptCount: number; answeredCount: number };

/** 랜딩 페이지 이용 현황. 행을 내려받지 않고 DB에서 개수만 센다(PostgREST 기본 1,000행 제한에 걸리지 않음).
 * 누적 문제 풀이 = 저장된 문항 답안 수(답을 고른 문항만 행이 생긴다). */
export async function getSiteStats(): Promise<SiteStats> {
  const admin = createAdminClient();
  // 관리자 계정의 테스트 응시는 이용 현황에서 뺀다. 응시는 관리자 id(몇 개뿐)로 거르고, 답안은
  // 전체 개수에서 관리자 응시의 답안 개수를 뺀다(응시 id 목록을 URL에 넣으면 길이 제한에 걸릴 수 있다).
  const adminIds = await listAdminUserIds();
  const attemptQuery = admin.from("attempts").select("id", { count: "exact", head: true });
  const [attempts, answers, adminAttemptIds] = await Promise.all([
    adminIds.length ? attemptQuery.not("user_id", "in", inList(adminIds)) : attemptQuery,
    admin.from("attempt_answers").select("id", { count: "exact", head: true }),
    listAdminAttemptIds(adminIds),
  ]);
  if (attempts.error || answers.error) throw new Error("이용 현황을 불러오지 못했습니다.");
  let adminAnswerCount = 0;
  for (let i = 0; i < adminAttemptIds.length; i += 100) {
    const { count, error } = await admin.from("attempt_answers").select("id", { count: "exact", head: true }).in("attempt_id", adminAttemptIds.slice(i, i + 100));
    if (error) throw new Error("이용 현황을 불러오지 못했습니다.");
    adminAnswerCount += count ?? 0;
  }
  return { attemptCount: attempts.count ?? 0, answeredCount: Math.max(0, (answers.count ?? 0) - adminAnswerCount) };
}
