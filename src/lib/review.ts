import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/supabase/paging";

export type ReviewFilter = "due" | "all" | "graduated";

export type ReviewItem = {
  questionId: string;
  certificationCode: string;
  certificationName: string;
  examTitle: string;
  examSlug: string;
  number: number;
  prompt: string;
  imageUrl: string | null;
  tags: string[];
  wrongCount: number;
  correctStreak: number;
  lastWrongAt: string;
  nextReviewAt: string;
  graduatedAt: string | null;
  isDue: boolean;
  choices: { label: string; content: string; isCorrect: boolean }[];
  correctAnswer: string;
  explanation: string | null;
};

export type ReviewCertTab = { code: string; name: string; count: number };

export type ReviewNotebook = {
  certifications: ReviewCertTab[];
  selectedCert: string;
  filter: ReviewFilter;
  counts: { active: number; due: number; graduated: number };
  items: ReviewItem[];
  currentPage: number;
  totalPages: number;
};

const PAGE_SIZE = 20;


/** 오답노트 데이터. 호출 전에 userId가 로그인한 본인인지 확인해야 한다(서버 전용, admin client 사용).
 * 정답·해설은 사용자가 이미 제출해서 틀린 문항에 대해서만 내려준다. */
type AdminClient = ReturnType<typeof createAdminClient>;
type ReviewRow = { question_id: string; wrong_count: number; correct_streak: number; last_wrong_at: string; next_review_at: string; graduated_at: string | null };
type QuestionRow = { id: string; exam_id: string; number: number; prompt: string; image_url: string | null; competency_tags: string[] };
type ExamRow = { id: string; slug: string; title: string; certification_id: string | null };
type CertRow = { id: string; code: string; name: string; sort_order: number };
type Joined = { review: ReviewRow; question: QuestionRow; exam: ExamRow; cert: CertRow };

/** 회원의 오답 행 전체를 문항·회차·자격증과 묶어서 가져온다. 자격증에 속하지 않는 문항은 제외. */
async function loadJoinedReviews(admin: AdminClient, userId: string): Promise<{ joined: Joined[]; certs: CertRow[] }> {
  const reviews: ReviewRow[] = await fetchAll((from, to) => admin
    .from("review_items")
    .select("question_id,wrong_count,correct_streak,last_wrong_at,next_review_at,graduated_at")
    .eq("user_id", userId)
    .order("question_id")
    .range(from, to), "오답노트를 불러오지 못했습니다.");

  const questions: QuestionRow[] = await fetchByIds(reviews.map((row) => row.question_id), (chunk, from, to) =>
    admin.from("questions").select("id,exam_id,number,prompt,image_url,competency_tags").in("id", chunk).eq("is_active", true).order("id").range(from, to));
  const exams: ExamRow[] = await fetchByIds([...new Set(questions.map((question) => question.exam_id))], (chunk, from, to) =>
    admin.from("exams").select("id,slug,title,certification_id").in("id", chunk).eq("status", "published").order("id").range(from, to));
  const certIds = [...new Set(exams.map((exam) => exam.certification_id).filter((id): id is string => Boolean(id)))];
  const certs: CertRow[] = certIds.length
    ? (await admin.from("certifications").select("id,code,name,sort_order").in("id", certIds).order("sort_order")).data ?? []
    : [];

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const examById = new Map(exams.map((exam) => [exam.id, exam]));
  const certById = new Map(certs.map((cert) => [cert.id, cert]));
  const joined = reviews.flatMap((review) => {
    const question = questionById.get(review.question_id);
    const exam = question ? examById.get(question.exam_id) : undefined;
    const cert = exam?.certification_id ? certById.get(exam.certification_id) : undefined;
    return question && exam && cert ? [{ review, question, exam, cert }] : [];
  });
  return { joined, certs };
}

const isDueAt = (now: number) => (row: Joined) => !row.review.graduated_at && new Date(row.review.next_review_at).getTime() <= now;

/** 복습 예정 → 많이 틀린 순 → 최근에 틀린 순 */
function byReviewPriority(now: number) {
  const isDue = isDueAt(now);
  return (a: Joined, b: Joined) => {
    const due = Number(isDue(b)) - Number(isDue(a));
    if (due) return due;
    const wrong = b.review.wrong_count - a.review.wrong_count;
    if (wrong) return wrong;
    return new Date(b.review.last_wrong_at).getTime() - new Date(a.review.last_wrong_at).getTime();
  };
}

export async function loadReviewNotebook(userId: string, certCode: string, filter: ReviewFilter, requestedPage: number): Promise<ReviewNotebook> {
  const admin = createAdminClient();
  const now = Date.now();

  const { joined, certs } = await loadJoinedReviews(admin, userId);

  const isDue = isDueAt(now);
  const certifications: ReviewCertTab[] = certs.map((cert) => ({
    code: cert.code,
    name: cert.name,
    count: joined.filter((row) => row.cert.id === cert.id && !row.review.graduated_at).length,
  }));
  const selectedCert = certifications.some((cert) => cert.code === certCode) ? certCode : "";
  const inCert = joined.filter((row) => !selectedCert || row.cert.code === selectedCert);
  const counts = {
    active: inCert.filter((row) => !row.review.graduated_at).length,
    due: inCert.filter(isDue).length,
    graduated: inCert.filter((row) => row.review.graduated_at).length,
  };

  const filtered = inCert
    .filter((row) => filter === "graduated" ? Boolean(row.review.graduated_at) : filter === "due" ? isDue(row) : !row.review.graduated_at)
    .sort(byReviewPriority(now));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1), totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const pageQuestionIds = pageRows.map((row) => row.question.id);
  const [choices, keys] = pageQuestionIds.length
    ? await Promise.all([
        fetchByIds(pageQuestionIds, (chunk, from, to) => admin.from("question_choices").select("id,question_id,label,content,sort_order").in("question_id", chunk).order("question_id").order("sort_order").range(from, to)),
        fetchByIds(pageQuestionIds, (chunk, from, to) => admin.from("answer_keys").select("question_id,correct_choice_id,correct_value,explanation").in("question_id", chunk).order("question_id").range(from, to)),
      ])
    : [[], []];
  const keyByQuestion = new Map(keys.map((key) => [key.question_id, key]));
  const choicesByQuestion = Map.groupBy(choices, (choice) => choice.question_id);

  const items: ReviewItem[] = pageRows.map(({ review, question, exam, cert }) => {
    const key = keyByQuestion.get(question.id);
    const questionChoices = (choicesByQuestion.get(question.id) ?? []).map((choice) => ({
      label: choice.label,
      content: choice.content,
      isCorrect: choice.id === key?.correct_choice_id,
    }));
    const correctChoice = questionChoices.find((choice) => choice.isCorrect);
    return {
      questionId: question.id,
      certificationCode: cert.code,
      certificationName: cert.name,
      examTitle: exam.title,
      examSlug: exam.slug,
      number: question.number,
      prompt: question.prompt,
      imageUrl: question.image_url,
      tags: question.competency_tags,
      wrongCount: review.wrong_count,
      correctStreak: review.correct_streak,
      lastWrongAt: review.last_wrong_at,
      nextReviewAt: review.next_review_at,
      graduatedAt: review.graduated_at,
      isDue: isDue({ review, question, exam, cert }),
      choices: questionChoices,
      correctAnswer: correctChoice ? `${correctChoice.label}. ${correctChoice.content}` : key?.correct_value ?? "",
      explanation: key?.explanation?.trim() || null,
    };
  });

  return { certifications, selectedCert, filter, counts, items, currentPage, totalPages };
}

/** 대시보드·결과 화면용 간단 집계. 테이블이 아직 없거나 조회에 실패하면 0으로 둔다. */
export async function getReviewCounts(userId: string): Promise<{ active: number; due: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const [active, due] = await Promise.all([
    admin.from("review_items").select("question_id", { count: "exact", head: true }).eq("user_id", userId).is("graduated_at", null),
    admin.from("review_items").select("question_id", { count: "exact", head: true }).eq("user_id", userId).is("graduated_at", null).lte("next_review_at", nowIso),
  ]);
  return { active: active.count ?? 0, due: due.count ?? 0 };
}

export type PracticeScope = "due" | "all";

export type PracticeQuestion = {
  questionId: string;
  certificationName: string;
  examTitle: string;
  number: number;
  prompt: string;
  imageUrl: string | null;
  tags: string[];
  wrongCount: number;
  correctStreak: number;
  choices: { label: string; content: string }[];
};

export type PracticeQueue = { certName: string | null; scope: PracticeScope; questions: PracticeQuestion[]; dueCount: number; activeCount: number };

export const PRACTICE_SESSION_SIZE = 20;

/** 복습 연습 대기열. 정답·해설은 넣지 않는다(채점은 /api/practice/answer 에서 서버가 한다). */
export async function loadPracticeQueue(userId: string, certCode: string, scope: PracticeScope): Promise<PracticeQueue> {
  const admin = createAdminClient();
  const now = Date.now();
  const isDue = isDueAt(now);
  const { joined } = await loadJoinedReviews(admin, userId);
  const inCert = joined.filter((row) => !row.review.graduated_at && (!certCode || row.cert.code === certCode));
  const picked = inCert
    .filter((row) => scope === "all" || isDue(row))
    .sort(byReviewPriority(now))
    .slice(0, PRACTICE_SESSION_SIZE);

  const choices = picked.length
    ? await fetchByIds(picked.map((row) => row.question.id), (chunk, from, to) =>
        admin.from("question_choices").select("question_id,label,content,sort_order").in("question_id", chunk).order("question_id").order("sort_order").range(from, to))
    : [];
  const choicesByQuestion = Map.groupBy(choices, (choice) => choice.question_id);

  return {
    certName: certCode ? inCert[0]?.cert.name ?? null : null,
    scope,
    dueCount: inCert.filter(isDue).length,
    activeCount: inCert.length,
    questions: picked.map(({ review, question, exam, cert }) => ({
      questionId: question.id,
      certificationName: cert.name,
      examTitle: exam.title,
      number: question.number,
      prompt: question.prompt,
      imageUrl: question.image_url,
      tags: question.competency_tags,
      wrongCount: review.wrong_count,
      correctStreak: review.correct_streak,
      choices: (choicesByQuestion.get(question.id) ?? []).map((choice) => ({ label: choice.label, content: choice.content })),
    })),
  };
}
