import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchByIds } from "@/lib/supabase/paging";

export type CertificationSummary = { id: string; code: string; name: string; description: string | null; examCount: number; mockCount: number; questionCount: number };

/** 기출이 아닌 예상문제(모의고사) 세트는 slug 에 "-mock-" 을 넣어 구분한다. 예: sazor2-mock-01 */
export const isMockExamSlug = (slug: string) => slug.includes("-mock-");

export type CertificationSchedule = {
  id: string;
  roundName: string;
  examDate: string | null;
  applyStart: string | null;
  applyEnd: string | null;
  notes: string | null;
};

export type CertificationExam = { slug: string; title: string; durationMinutes: number; questionCount: number };

export type CertificationDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  schedules: CertificationSchedule[];
  exams: CertificationExam[];
};

export async function listCertifications(): Promise<CertificationSummary[]> {
  const admin = createAdminClient();
  const { data: certifications, error } = await admin
    .from("certifications")
    .select("id,code,name,description")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error("자격증 목록을 불러오지 못했습니다.");
  if (!certifications?.length) return [];

  const { data: exams, error: examError } = await admin
    .from("exams")
    .select("certification_id,slug,questions(count)")
    .in("certification_id", certifications.map((cert) => cert.id))
    .eq("status", "published");
  if (examError) throw new Error("자격증 시험 수를 불러오지 못했습니다.");

  // 자격증 이름 가나다순으로 보여 준다.
  const byName = [...certifications].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return byName.map((cert) => {
    const certExams = (exams ?? []).filter((exam) => exam.certification_id === cert.id);
    // questions(count) 는 PostgREST 집계 임베드라 [{ count }] 형태로 온다.
    const questionCount = certExams.reduce((sum, exam) => sum + ((exam.questions as unknown as { count: number }[])[0]?.count ?? 0), 0);
    const mockCount = certExams.filter((exam) => isMockExamSlug(exam.slug)).length;
    return { ...cert, examCount: certExams.length - mockCount, mockCount, questionCount };
  });
}

export async function getCertification(code: string): Promise<CertificationDetail | null> {
  const admin = createAdminClient();
  const { data: cert, error } = await admin
    .from("certifications")
    .select("id,code,name,description")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("자격증을 불러오지 못했습니다.");
  if (!cert) return null;

  const [{ data: schedules, error: scheduleError }, { data: exams, error: examError }] = await Promise.all([
    admin.from("certification_schedules").select("id,round_name,exam_date,apply_start,apply_end,notes").eq("certification_id", cert.id).order("sort_order"),
    admin.from("exams").select("id,slug,title,duration_minutes").eq("certification_id", cert.id).eq("status", "published").order("published_at", { ascending: false }),
  ]);
  if (scheduleError || examError || !exams) throw new Error("자격증 상세 정보를 불러오지 못했습니다.");

  const examIds = exams.map((exam) => exam.id);
  // 사회복지사 1급처럼 문항이 1,000개를 넘는 자격증도 있어 끝까지 나눠 읽는다(PostgREST 1,000행 제한).
  const questions = await fetchByIds(examIds, (ids, from, to) =>
    admin.from("questions").select("id,exam_id").in("exam_id", ids).eq("is_active", true).order("id").range(from, to), "자격증 문항 수를 불러오지 못했습니다.");

  return {
    id: cert.id,
    code: cert.code,
    name: cert.name,
    description: cert.description,
    schedules: (schedules ?? []).map((schedule) => ({
      id: schedule.id, roundName: schedule.round_name, examDate: schedule.exam_date,
      applyStart: schedule.apply_start, applyEnd: schedule.apply_end, notes: schedule.notes,
    })),
    exams: exams.map((exam) => ({
      slug: exam.slug, title: exam.title, durationMinutes: exam.duration_minutes,
      questionCount: questions.filter((question) => question.exam_id === exam.id).length,
    })),
  };
}
