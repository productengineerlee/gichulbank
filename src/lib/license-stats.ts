import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/supabase/paging";
import { listAdminAttemptIds } from "@/lib/stats-exclusion";

// PostgREST는 요청당 최대 1,000행만 돌려주고, .in() 목록은 URL 길이 제한이 있다. 한국사처럼
// 응시가 많은 자격증은 문항 150개 묶음 하나의 답안만 1,000행을 넘으므로, 대량 조회는 모두
// fetchAll/fetchByIds로 id 정렬을 걸고 끝까지 나눠 읽는다.

export type QuestionStat = {
  questionId: string;
  examSlug: string;
  examTitle: string;
  number: number;
  prompt: string;
  sectionCode: string;
  attemptCount: number;
  correctCount: number;
  accuracy: number;
};

export type SectionStat = { code: string; title: string; attemptCount: number; correctCount: number; accuracy: number; questionCount: number };
export type RoundQuestionStat = { number: number; attemptCount: number; correctCount: number; accuracy: number };
export type RoundStat = { examSlug: string; examTitle: string; questions: RoundQuestionStat[] };

export type CertificationStats = {
  questionCount: number;
  attemptCount: number;
  respondentCount: number;
  sectionStats: SectionStat[];
  roundStats: RoundStat[];
  hardestQuestions: QuestionStat[];
};

function accuracyOf(attemptCount: number, correctCount: number) {
  return attemptCount ? Number((correctCount / attemptCount * 100).toFixed(1)) : 0;
}

const HARDEST_MIN_ATTEMPTS = 5;
const HARDEST_LIMIT = 10;

export async function getCertificationStats(certificationId: string): Promise<CertificationStats> {
  const admin = createAdminClient();
  const { data: exams, error: examError } = await admin.from("exams").select("id,slug,title").eq("certification_id", certificationId);
  if (examError) throw new Error("자격증 시험 목록을 불러오지 못했습니다.");
  const examIds = (exams ?? []).map((exam) => exam.id);
  if (!examIds.length) return { questionCount: 0, attemptCount: 0, respondentCount: 0, sectionStats: [], roundStats: [], hardestQuestions: [] };
  const examById = new Map((exams ?? []).map((exam) => [exam.id, exam]));

  const [sections, questions] = await Promise.all([
    fetchByIds(examIds, (ids, from, to) => admin.from("exam_sections").select("id,exam_id,code,title,sort_order").in("exam_id", ids).order("sort_order").order("id").range(from, to), "자격증 문항 구성을 불러오지 못했습니다."),
    fetchByIds(examIds, (ids, from, to) => admin.from("questions").select("id,exam_id,section_id,number,prompt").in("exam_id", ids).eq("is_active", true).order("id").range(from, to), "자격증 문항 구성을 불러오지 못했습니다."),
  ]);
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  const questionIds = questions.map((question) => question.id);
  const [seedRows, allLiveAnswers, adminAttemptIds] = await Promise.all([
    fetchByIds(questionIds, (ids, from, to) => admin.from("question_stat_seed").select("question_id,attempt_count,correct_count").in("question_id", ids).order("question_id").range(from, to), "자격증 통계를 불러오지 못했습니다."),
    fetchByIds(questionIds, (ids, from, to) => admin.from("attempt_answers").select("id,attempt_id,question_id,is_correct").in("question_id", ids).not("is_correct", "is", null).order("id").range(from, to), "자격증 통계를 불러오지 못했습니다."),
    listAdminAttemptIds(),
  ]);
  // 관리자 계정의 테스트 응시는 통계에서 뺀다.
  const excluded = new Set(adminAttemptIds);
  const liveAnswers = allLiveAnswers.filter((answer) => !excluded.has(answer.attempt_id));

  const countsByQuestion = new Map<string, { attempt: number; correct: number }>();
  for (const row of seedRows) countsByQuestion.set(row.question_id, { attempt: row.attempt_count, correct: row.correct_count });
  for (const answer of liveAnswers) {
    const current = countsByQuestion.get(answer.question_id) ?? { attempt: 0, correct: 0 };
    current.attempt += 1;
    if (answer.is_correct) current.correct += 1;
    countsByQuestion.set(answer.question_id, current);
  }

  const questionStats: QuestionStat[] = questions.map((question) => {
    const counts = countsByQuestion.get(question.id) ?? { attempt: 0, correct: 0 };
    const exam = examById.get(question.exam_id);
    return {
      questionId: question.id,
      examSlug: exam?.slug ?? "",
      examTitle: exam?.title ?? "",
      number: question.number,
      prompt: question.prompt,
      sectionCode: sectionById.get(question.section_id)?.code ?? "",
      attemptCount: counts.attempt,
      correctCount: counts.correct,
      accuracy: accuracyOf(counts.attempt, counts.correct),
    };
  });

  // exam_sections는 sort_order로 정렬해 가져왔으므로, 코드별 첫 등장 순서가 곧 출제 과목 순서다.
  const orderedSectionCodes = [...new Map(sections.map((section) => [section.code, section.title])).entries()];
  const sectionStats: SectionStat[] = orderedSectionCodes.map(([code, title]) => {
    const matching = questionStats.filter((stat) => stat.sectionCode === code);
    const attempt = matching.reduce((sum, stat) => sum + stat.attemptCount, 0);
    const correct = matching.reduce((sum, stat) => sum + stat.correctCount, 0);
    return { code, title, attemptCount: attempt, correctCount: correct, accuracy: accuracyOf(attempt, correct), questionCount: matching.length };
  });

  // 회차 선택 시 그 회차 문항 전체를 번호순 막대그래프로 보여주기 위한 통계.
  const questionsByExam = new Map<string, RoundQuestionStat[]>();
  for (const stat of questionStats) {
    const list = questionsByExam.get(stat.examSlug) ?? [];
    list.push({ number: stat.number, attemptCount: stat.attemptCount, correctCount: stat.correctCount, accuracy: stat.accuracy });
    questionsByExam.set(stat.examSlug, list);
  }
  const roundStats: RoundStat[] = [...questionsByExam.entries()].map(([examSlug, list]) => ({
    examSlug,
    examTitle: questionStats.find((stat) => stat.examSlug === examSlug)?.examTitle ?? "",
    questions: list.sort((a, b) => a.number - b.number),
  }));

  const hardestQuestions = questionStats
    .filter((stat) => stat.attemptCount >= HARDEST_MIN_ATTEMPTS)
    .sort((a, b) => a.accuracy - b.accuracy || b.attemptCount - a.attemptCount)
    .slice(0, HARDEST_LIMIT);

  const attemptCount = questionStats.reduce((sum, stat) => sum + stat.attemptCount, 0);

  // 응시자 수는 문항별 정오 데이터에 저장되지 않으므로, 시험(A형/B형)별로 가장 많이 응답된
  // 문항의 attemptCount(공백이 가장 적은 문항)를 그 시험의 응시자 수 근사치로 삼아 합산한다.
  const respondentByExam = new Map<string, number>();
  for (const stat of questionStats) {
    const current = respondentByExam.get(stat.examSlug) ?? 0;
    if (stat.attemptCount > current) respondentByExam.set(stat.examSlug, stat.attemptCount);
  }
  const respondentCount = [...respondentByExam.values()].reduce((sum, value) => sum + value, 0);

  return { questionCount: questionStats.length, attemptCount, respondentCount, sectionStats, roundStats, hardestQuestions };
}

export type WrongAnswerItem = {
  attemptId: string;
  examSlug: string;
  examTitle: string;
  submittedAt: string | null;
  number: number;
  prompt: string;
  sectionCode: string;
  choices: { label: string; content: string }[];
  selectedLabel: string | null;
  correctLabel: string | null;
  explanation: string | null;
};

export async function getWrongAnswerNotebook(userId: string, certificationId: string): Promise<WrongAnswerItem[]> {
  const admin = createAdminClient();
  const { data: exams, error: examError } = await admin.from("exams").select("id,slug,title").eq("certification_id", certificationId);
  if (examError) throw new Error("자격증 시험 목록을 불러오지 못했습니다.");
  const examIds = (exams ?? []).map((exam) => exam.id);
  if (!examIds.length) return [];
  const examById = new Map((exams ?? []).map((exam) => [exam.id, exam]));

  const attempts = await fetchAll((from, to) => admin
    .from("attempts").select("id,exam_id,submitted_at")
    .eq("user_id", userId).in("exam_id", examIds).in("status", ["submitted", "graded"])
    .order("id").range(from, to), "응시 기록을 불러오지 못했습니다.");
  const attemptIds = attempts.map((attempt) => attempt.id);
  if (!attemptIds.length) return [];
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));

  const wrongAnswers = await fetchByIds(attemptIds, (ids, from, to) => admin
    .from("attempt_answers").select("id,attempt_id,question_id,selected_choice_id")
    .eq("is_correct", false).in("attempt_id", ids)
    .order("id").range(from, to), "오답을 불러오지 못했습니다.");
  if (!wrongAnswers.length) return [];
  const questionIds = [...new Set(wrongAnswers.map((answer) => answer.question_id))];

  const errorMessage = "오답노트 문항 정보를 불러오지 못했습니다.";
  const [questions, choices, answerKeys, sections] = await Promise.all([
    fetchByIds(questionIds, (ids, from, to) => admin.from("questions").select("id,exam_id,section_id,number,prompt").in("id", ids).order("id").range(from, to), errorMessage),
    fetchByIds(questionIds, (ids, from, to) => admin.from("question_choices").select("id,question_id,label,content,sort_order").in("question_id", ids).order("question_id").order("sort_order").order("id").range(from, to), errorMessage),
    fetchByIds(questionIds, (ids, from, to) => admin.from("answer_keys").select("question_id,correct_choice_id,explanation").in("question_id", ids).order("question_id").range(from, to), errorMessage),
    fetchByIds(examIds, (ids, from, to) => admin.from("exam_sections").select("id,code").in("exam_id", ids).order("id").range(from, to), errorMessage),
  ]);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const keyByQuestion = new Map(answerKeys.map((key) => [key.question_id, key]));
  const choiceById = new Map(choices.map((choice) => [choice.id, choice]));
  const sectionCodeById = new Map(sections.map((section) => [section.id, section.code]));

  return wrongAnswers
    .map((answer) => {
      const question = questionById.get(answer.question_id);
      if (!question) return null;
      const exam = examById.get(question.exam_id);
      const attempt = attemptById.get(answer.attempt_id);
      const key = keyByQuestion.get(question.id);
      return {
        attemptId: answer.attempt_id,
        examSlug: exam?.slug ?? "",
        examTitle: exam?.title ?? "",
        submittedAt: attempt?.submitted_at ?? null,
        number: question.number,
        prompt: question.prompt,
        sectionCode: sectionCodeById.get(question.section_id) ?? "",
        choices: choices.filter((choice) => choice.question_id === question.id).map((choice) => ({ label: choice.label, content: choice.content })),
        selectedLabel: answer.selected_choice_id ? choiceById.get(answer.selected_choice_id)?.label ?? null : null,
        correctLabel: key?.correct_choice_id ? choiceById.get(key.correct_choice_id)?.label ?? null : null,
        explanation: key?.explanation ?? null,
      } satisfies WrongAnswerItem;
    })
    .filter((item): item is WrongAnswerItem => item !== null)
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "") || a.number - b.number);
}
