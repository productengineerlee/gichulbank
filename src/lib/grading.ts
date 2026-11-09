import "server-only";

import { generateDiagnostics, type DiagnosticSummary } from "@/lib/diagnostics";
import type { Context } from "@/lib/attempts";
import type { Database } from "@/types/database";

type AnswerKey = Database["public"]["Tables"]["answer_keys"]["Row"];
export type SubmittedAnswers = Record<string, string>;
export type QuestionResult = { number: number; section: string; tags: string[]; prompt: string; imageUrl: string | null; userAnswer: string; userAnswerDisplay: string; correctAnswer: string; isCorrect: boolean; awardedScore: number; maxScore: number; explanation: string };
export type SectionResult = { code: string; title: string; earnedScore: number; maxScore: number; minScore: number | null; correctCount: number; questionCount: number; percentage: number };
export type GradingResult = { id: string; examSlug: string; examTitle: string; certificationCode: string | null; submittedAt: string; totalScore: number; maxScore: number; passingScore: number; passed: boolean; correctCount: number; answeredCount: number; questionCount: number; sections: SectionResult[]; questions: QuestionResult[]; diagnostics: DiagnosticSummary };

const normalize = (value: string, caseSensitive = false) => {
  const normalized = value.trim().replace(/,/g, "").replace(/\s+/g, "");
  return caseSensitive ? normalized : normalized.toLowerCase();
};
function numeric(value: string) {
  const match = normalize(value).match(/^([-+]?\d+(?:\.\d+)?)(k|%)?$/);
  if (!match) return null;
  let parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  if (match[2] === "k") parsed *= 1000;
  return parsed;
}
function rounded(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function checkValue(user: string, key: AnswerKey) {
  const expected = key.correct_value ?? "";
  const accepted = [expected, ...key.accepted_values].filter(Boolean);
  if (key.grading_type === "multiple_answers") {
    return accepted.some((value) => normalize(user, key.case_sensitive) === normalize(value, key.case_sensitive));
  }
  if (key.grading_type === "exact") {
    const userNumber = numeric(user);
    const expectedNumber = numeric(expected);
    return userNumber !== null && expectedNumber !== null
      ? userNumber === expectedNumber
      : normalize(user, key.case_sensitive) === normalize(expected, key.case_sensitive);
  }
  const userNumber = numeric(user);
  const expectedNumber = numeric(expected);
  if (userNumber === null || expectedNumber === null) return false;
  if (key.grading_type === "rounded") return rounded(userNumber, key.decimal_places ?? 0) === rounded(expectedNumber, key.decimal_places ?? 0);
  if (key.grading_type === "absolute_tolerance") return Math.abs(userNumber - expectedNumber) <= Number(key.tolerance ?? 0);
  if (key.grading_type === "relative_tolerance") {
    return expectedNumber === 0
      ? Math.abs(userNumber) <= Number(key.tolerance ?? 0)
      : Math.abs(userNumber - expectedNumber) / Math.abs(expectedNumber) <= Number(key.tolerance ?? 0);
  }
  return false;
}

/** Pure grading over an already-fetched Context — call getExamContext() once per request and
 * pass it in here, rather than each having its own Supabase round trip. */
export async function gradeExam(context: Context, submitted: SubmittedAnswers): Promise<GradingResult> {
  const { exam, sections, questions, choices, answerKeys } = context;

  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const keyByQuestion = new Map(answerKeys.map((key) => [key.question_id, key]));
  const choiceById = new Map(choices.map((choice) => [choice.id, choice]));
  const questionResults: QuestionResult[] = questions.map((question) => {
    const key = keyByQuestion.get(question.id);
    if (!key) throw new Error(`문항 ${question.number}의 정답이 없습니다.`);
    const userAnswer = String(submitted[String(question.number)] ?? "");
    const questionChoices = choices.filter((choice) => choice.question_id === question.id);
    const userChoice = questionChoices.find((choice) => `${question.number}:${choice.label}` === userAnswer);
    const correctChoice = key.correct_choice_id ? choiceById.get(key.correct_choice_id) : null;
    // 객관식은 정답 보기 외에 accepted_values 의 보기 번호도 정답(시행기관이 복수 정답 처리한 문항)
    const isCorrect = Boolean(userAnswer) && (correctChoice
      ? userChoice !== undefined && (userChoice.label === correctChoice.label || key.accepted_values.includes(userChoice.label))
      : checkValue(userAnswer, key));
    const section = sectionById.get(question.section_id);
    return {
      number: question.number,
      section: section?.code ?? "",
      tags: question.competency_tags,
      prompt: question.prompt,
      imageUrl: question.image_url,
      userAnswer,
      userAnswerDisplay: userChoice ? `${userChoice.label}. ${userChoice.content}` : userAnswer || "미응답",
      correctAnswer: correctChoice ? `${correctChoice.label}. ${correctChoice.content}` : key.correct_value ?? "",
      isCorrect,
      awardedScore: isCorrect ? Number(question.score) : 0,
      maxScore: Number(question.score),
      explanation: key.explanation ?? "",
    };
  });

  const sectionResults: SectionResult[] = sections.map((section) => {
    const sectionQuestions = questionResults.filter((question) => question.section === section.code);
    const maxScore = Number(section.max_score);
    const earnedScore = sectionQuestions.reduce((sum, question) => sum + question.awardedScore, 0);
    return {
      code: section.code,
      title: section.title,
      earnedScore: Number(earnedScore.toFixed(2)),
      maxScore,
      minScore: section.min_score === null ? null : Number(section.min_score),
      correctCount: sectionQuestions.filter((question) => question.isCorrect).length,
      questionCount: sectionQuestions.length,
      percentage: maxScore ? Number((earnedScore / maxScore * 100).toFixed(1)) : 0,
    };
  }).filter((section) => section.questionCount > 0);

  const totalScore = Number(questionResults.reduce((sum, question) => sum + question.awardedScore, 0).toFixed(2));
  const maxScore = Number(exam.total_score);
  const passingScore = Number(exam.passing_score);
  // 경영정보시각화능력처럼 "과목당 최소 점수"가 있는 시험은 총점 기준을 넘겨도
  // 한 과목이라도 최소 점수 미달이면 불합격 처리한다. min_score가 없는 과목은 그대로 통과.
  const meetsSectionMinimums = sectionResults.every((section) => section.minScore === null || section.earnedScore >= section.minScore);
  const diagnostics = await generateDiagnostics(sectionResults, questionResults);
  return {
    id: crypto.randomUUID(),
    examSlug: exam.slug,
    examTitle: exam.title,
    certificationCode: context.certificationCode,
    submittedAt: new Date().toISOString(),
    totalScore,
    maxScore,
    passingScore,
    passed: totalScore >= passingScore && meetsSectionMinimums,
    correctCount: questionResults.filter((question) => question.isCorrect).length,
    answeredCount: questionResults.filter((question) => question.userAnswer).length,
    questionCount: questionResults.length,
    sections: sectionResults,
    questions: questionResults,
    diagnostics,
  };
}
