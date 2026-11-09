import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/supabase/paging";
import type { DiagnosticLevel } from "@/lib/diagnostic-level";

/** 정답률 → 진단 단계. 표본이 적을 때 과하게 판단하지 않도록 최소 풀이 수를 함께 본다. */
const MIN_SECTION_ANSWERS = 5;
const MIN_TAG_ANSWERS = 3;
const WEAK_TAG_LIMIT = 6;

function levelOf(accuracy: number): DiagnosticLevel {
  if (accuracy < 40) return "foundation";
  if (accuracy < 60) return "weak";
  if (accuracy < 80) return "developing";
  return "strong";
}

const pct = (correct: number, total: number) => total > 0 ? Math.round(correct / total * 1000) / 10 : 0;

export type AccuracyStat = { key: string; title: string; answered: number; correct: number; accuracy: number; level: DiagnosticLevel; enough: boolean };

export type CertInsight = {
  code: string;
  name: string;
  answered: number;
  correct: number;
  accuracy: number;
  practiceAnswered: number;
  sections: AccuracyStat[];
  weakTags: AccuracyStat[];
};

export type LearningInsights = { certifications: CertInsight[]; selected: CertInsight | null };

type Answer = { questionId: string; isCorrect: boolean; source: "exam" | "practice" };

/** 회차 응시(채점 완료) + 문항 연습 기록을 합쳐 자격증별·과목(영역)별·유형(태그)별 정답률을 계산한다. */
export async function loadLearningInsights(userId: string, certCode: string): Promise<LearningInsights> {
  const admin = createAdminClient();

  const [attempts, practice] = await Promise.all([
    fetchAll((from, to) => admin.from("attempts").select("id").eq("user_id", userId).eq("status", "graded").order("id").range(from, to)),
    fetchAll((from, to) => admin.from("practice_answers").select("id,question_id,is_correct").eq("user_id", userId).order("id").range(from, to)),
  ]);
  const examAnswers = await fetchByIds(attempts.map((attempt) => attempt.id), (chunk, from, to) =>
    admin.from("attempt_answers").select("id,question_id,is_correct").in("attempt_id", chunk).order("id").range(from, to));

  const answers: Answer[] = [
    ...examAnswers.map((row) => ({ questionId: row.question_id, isCorrect: Boolean(row.is_correct), source: "exam" as const })),
    ...practice.map((row) => ({ questionId: row.question_id, isCorrect: row.is_correct, source: "practice" as const })),
  ];
  if (!answers.length) return { certifications: [], selected: null };

  const questions = await fetchByIds(answers.map((answer) => answer.questionId), (chunk, from, to) =>
    admin.from("questions").select("id,exam_id,section_id,competency_tags").in("id", chunk).order("id").range(from, to));
  const [exams, sections] = await Promise.all([
    fetchByIds(questions.map((question) => question.exam_id), (chunk, from, to) =>
      admin.from("exams").select("id,certification_id").in("id", chunk).not("certification_id", "is", null).order("id").range(from, to)),
    fetchByIds(questions.map((question) => question.section_id), (chunk, from, to) =>
      admin.from("exam_sections").select("id,code,title,sort_order").in("id", chunk).order("id").range(from, to)),
  ]);
  const certIds = [...new Set(exams.map((exam) => exam.certification_id as string))];
  const { data: certs, error: certError } = certIds.length
    ? await admin.from("certifications").select("id,code,name,sort_order").in("id", certIds).order("sort_order")
    : { data: [], error: null };
  if (certError) throw new Error("자격증 정보를 불러오지 못했습니다.");

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const certIdByExam = new Map(exams.map((exam) => [exam.id, exam.certification_id as string]));
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  type Bucket = { title: string; order: number; answered: number; correct: number };
  type CertAgg = { answered: number; correct: number; practice: number; sections: Map<string, Bucket>; tags: Map<string, Bucket> };
  const byCert = new Map<string, CertAgg>();
  const bump = (map: Map<string, Bucket>, key: string, title: string, order: number, correct: boolean) => {
    const bucket = map.get(key) ?? { title, order, answered: 0, correct: 0 };
    bucket.answered += 1;
    bucket.correct += correct ? 1 : 0;
    map.set(key, bucket);
  };

  for (const answer of answers) {
    const question = questionById.get(answer.questionId);
    const certId = question ? certIdByExam.get(question.exam_id) : undefined;
    if (!question || !certId) continue; // 자격증에 속하지 않는 문항은 제외
    const agg = byCert.get(certId) ?? { answered: 0, correct: 0, practice: 0, sections: new Map(), tags: new Map() };
    agg.answered += 1;
    agg.correct += answer.isCorrect ? 1 : 0;
    agg.practice += answer.source === "practice" ? 1 : 0;
    // 회차마다 section 행은 다르지만 code가 같으면 같은 과목(시대)으로 묶는다.
    const section = sectionById.get(question.section_id);
    if (section) bump(agg.sections, section.code, section.title, section.sort_order, answer.isCorrect);
    for (const tag of question.competency_tags) bump(agg.tags, tag, tag, 0, answer.isCorrect);
    byCert.set(certId, agg);
  }

  const toStat = (minAnswers: number) => ([key, bucket]: [string, Bucket]): AccuracyStat => {
    const accuracy = pct(bucket.correct, bucket.answered);
    return { key, title: bucket.title, answered: bucket.answered, correct: bucket.correct, accuracy, level: levelOf(accuracy), enough: bucket.answered >= minAnswers };
  };

  const certifications: CertInsight[] = (certs ?? []).flatMap((cert) => {
    const agg = byCert.get(cert.id);
    if (!agg) return [];
    return [{
      code: cert.code,
      name: cert.name,
      answered: agg.answered,
      correct: agg.correct,
      accuracy: pct(agg.correct, agg.answered),
      practiceAnswered: agg.practice,
      sections: [...agg.sections.entries()]
        .sort((a, b) => a[1].order - b[1].order)
        .map(toStat(MIN_SECTION_ANSWERS)),
      weakTags: [...agg.tags.entries()]
        .map(toStat(MIN_TAG_ANSWERS))
        .filter((stat) => stat.enough && stat.accuracy < 80)
        .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
        .slice(0, WEAK_TAG_LIMIT),
    }];
  });

  const selected = certifications.find((cert) => cert.code === certCode)
    ?? [...certifications].sort((a, b) => b.answered - a.answered)[0]
    ?? null;
  return { certifications, selected };
}

// ── 연속 학습일 ──

export type StudyStreak = {
  current: number;
  best: number;
  totalDays: number;
  studiedToday: boolean;
  /** 최근 28일(오래된 날 → 오늘), 그날 푼 문항 수 */
  recent: { date: string; count: number }[];
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
/** 한국 시간 기준 날짜 번호(1970-01-01부터 며칠째) */
const kstDay = (iso: string) => Math.floor((new Date(iso).getTime() + KST_OFFSET_MS) / DAY_MS);
const dayLabel = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** 회차 제출일과 문항 연습일(한국 시간)을 학습한 날로 보고 연속 학습일을 계산한다. 오늘 아직 안 풀었어도 어제까지 이어졌으면 유지. */
export async function loadStudyStreak(userId: string): Promise<StudyStreak> {
  const admin = createAdminClient();
  const [attempts, practice] = await Promise.all([
    fetchAll((from, to) => admin.from("attempts").select("id,submitted_at,graded_at,answered_count").eq("user_id", userId).in("status", ["graded", "submitted"]).order("id").range(from, to)),
    fetchAll((from, to) => admin.from("practice_answers").select("id,answered_at").eq("user_id", userId).order("id").range(from, to)),
  ]);

  const countByDay = new Map<number, number>();
  const add = (iso: string | null, count: number) => {
    if (!iso) return;
    const day = kstDay(iso);
    countByDay.set(day, (countByDay.get(day) ?? 0) + count);
  };
  for (const attempt of attempts) add(attempt.graded_at ?? attempt.submitted_at, attempt.answered_count);
  for (const answer of practice) add(answer.answered_at, 1);

  const today = kstDay(new Date().toISOString());
  const days = [...countByDay.keys()].sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const studiedToday = countByDay.has(today);
  let current = 0;
  for (let day = studiedToday ? today : today - 1; countByDay.has(day); day--) current++;

  return {
    current,
    best,
    totalDays: days.length,
    studiedToday,
    recent: Array.from({ length: 28 }, (_, index) => {
      const day = today - 27 + index;
      return { date: dayLabel(day), count: countByDay.get(day) ?? 0 };
    }),
  };
}
