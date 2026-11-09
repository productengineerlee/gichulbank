"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdminAction } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DiagnosticLevel } from "@/lib/diagnostics";
import type { ExamStatus, GradingType } from "@/types/database";

const examStatuses: ExamStatus[] = ["draft", "published", "archived"];
const gradingTypes: GradingType[] = ["exact", "rounded", "absolute_tolerance", "relative_tolerance", "multiple_answers"];
const diagnosticLevels: DiagnosticLevel[] = ["foundation", "weak", "developing", "strong"];

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function nullable(formData: FormData, key: string) { return text(formData, key) || null; }
function numberValue(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  if (!Number.isFinite(value)) throw new Error(`${key} 값이 올바르지 않습니다.`);
  return value;
}
function adminPath(value: string, fallback: string) { return value.startsWith("/admin") && !value.startsWith("//") ? value : fallback; }
function redirectMessage(path: string, key: "saved" | "error", message: string): never {
  const url = new URL(path, "http://admin.local");
  url.searchParams.set(key, message);
  redirect(`${url.pathname}${url.search}`);
}
function resolveReturnTo(formData: FormData, fallback: string) { return adminPath(text(formData, "returnTo"), fallback); }
function parseOrRedirect<T>(returnTo: string, parse: () => T): T {
  try { return parse(); }
  catch (error) { redirectMessage(returnTo, "error", error instanceof Error ? error.message : "입력값을 확인해 주세요."); }
}

export async function updateExamAction(formData: FormData) {
  await assertAdminAction();
  const admin = createAdminClient();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const status = text(formData, "status") as ExamStatus;
  const duration = numberValue(formData, "durationMinutes");
  const passingScore = numberValue(formData, "passingScore");
  const returnTo = resolveReturnTo(formData, `/admin/exams/${id}`);
  if (!title || !examStatuses.includes(status) || duration < 1 || duration > 600 || passingScore < 0) redirectMessage(returnTo, "error", "시험 설정값을 확인해 주세요.");
  const { data: exam } = await admin.from("exams").select("total_score").eq("id", id).maybeSingle();
  if (!exam || passingScore > Number(exam.total_score)) redirectMessage(returnTo, "error", "합격 점수는 총점보다 높을 수 없습니다.");
  const { error } = await admin.from("exams").update({
    title,
    description: nullable(formData, "description"),
    status,
    duration_minutes: Math.round(duration),
    passing_score: passingScore,
    fixed_order: formData.get("fixedOrder") === "on",
  }).eq("id", id);
  if (error) redirectMessage(returnTo, "error", `시험 저장 실패: ${error.message}`);
  revalidatePath("/admin");
  revalidatePath(returnTo.split("?")[0]);
  revalidatePath("/exams");
  redirectMessage(returnTo, "saved", "시험 설정을 저장했습니다.");
}

export async function updateQuestionAction(formData: FormData) {
  await assertAdminAction();
  const admin = createAdminClient();
  const id = text(formData, "id");
  const returnTo = resolveReturnTo(formData, `/admin/questions/${id}`);
  const { data: question, error: questionError } = await admin.from("questions").select("id,exam_id,type").eq("id", id).maybeSingle();
  if (questionError || !question) redirectMessage(returnTo, "error", "문항을 찾을 수 없습니다.");

  const prompt = text(formData, "prompt");
  const sectionId = text(formData, "sectionId");
  const score = numberValue(formData, "score");
  const difficulty = numberValue(formData, "difficulty");
  const isActive = formData.get("isActive") === "on";
  if (!prompt || score <= 0 || difficulty < 1 || difficulty > 5) redirectMessage(returnTo, "error", "문항 내용·배점·난이도를 확인해 주세요.");
  const { data: section } = await admin.from("exam_sections").select("id").eq("id", sectionId).eq("exam_id", question.exam_id).maybeSingle();
  if (!section) redirectMessage(returnTo, "error", "해당 시험의 영역을 선택해 주세요.");

  const [{ data: choices }, { data: allQuestions }, { data: exam }] = await Promise.all([
    admin.from("question_choices").select("id").eq("question_id", id),
    admin.from("questions").select("id,section_id,score,is_active").eq("exam_id", question.exam_id),
    admin.from("exams").select("passing_score").eq("id", question.exam_id).single(),
  ]);
  const choiceIds = new Set((choices ?? []).map(choice => choice.id));
  const correctChoiceId = nullable(formData, "correctChoiceId");
  if (question.type === "single_choice" && (!correctChoiceId || !choiceIds.has(correctChoiceId))) redirectMessage(returnTo, "error", "객관식 문항의 정답 보기를 선택해 주세요.");
  const choiceContents = new Map<string, string>();
  for (const choiceId of choiceIds) {
    const content = text(formData, `choice_${choiceId}`);
    if (!content) redirectMessage(returnTo, "error", "보기 내용은 비워둘 수 없습니다.");
    choiceContents.set(choiceId, content);
  }

  const gradingType = text(formData, "gradingType") as GradingType;
  if (!gradingTypes.includes(gradingType)) redirectMessage(returnTo, "error", "채점 방식을 확인해 주세요.");
  const acceptedValues = text(formData, "acceptedValues").split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  const decimalPlacesRaw = nullable(formData, "decimalPlaces");
  const toleranceRaw = nullable(formData, "tolerance");
  const decimalPlaces = decimalPlacesRaw === null ? null : Number(decimalPlacesRaw);
  const tolerance = toleranceRaw === null ? null : Number(toleranceRaw);
  if ((decimalPlaces !== null && (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 10)) || (tolerance !== null && (!Number.isFinite(tolerance) || tolerance < 0))) redirectMessage(returnTo, "error", "채점 자릿수와 허용 오차를 확인해 주세요.");
  if ((gradingType === "absolute_tolerance" || gradingType === "relative_tolerance") && tolerance === null) redirectMessage(returnTo, "error", "이 채점 방식은 허용 오차 값이 반드시 필요합니다.");

  const prospective = (allQuestions ?? []).map(item => item.id === id ? { ...item, score, section_id: sectionId, is_active: isActive } : item);
  const totalScore = prospective.filter(item => item.is_active).reduce((sum, item) => sum + Number(item.score), 0);
  if (totalScore < Number(exam?.passing_score ?? 0)) redirectMessage(returnTo, "error", "변경 후 총점이 합격 점수보다 낮아집니다.");

  const tags = text(formData, "competencyTags").split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  const { error: updateError } = await admin.from("questions").update({
    section_id: sectionId,
    prompt,
    instructions: nullable(formData, "instructions"),
    score,
    difficulty: Math.round(difficulty),
    competency_tags: [...new Set(tags)],
    answer_format_hint: nullable(formData, "answerFormatHint"),
    is_active: isActive,
  }).eq("id", id);
  if (updateError) redirectMessage(returnTo, "error", `문항 저장 실패: ${updateError.message}`);

  // Recompute section/exam totals right away, since they only depend on the questions write above
  // (already committed) and not on the answer_keys/choices writes below. Keeping this next to the
  // questions write means a later failure in those steps can never leave totals stale relative to
  // the new score that's already live.
  const sectionTotals = new Map<string, number>();
  for (const item of prospective.filter(item => item.is_active)) sectionTotals.set(item.section_id, (sectionTotals.get(item.section_id) ?? 0) + Number(item.score));
  const { data: sections } = await admin.from("exam_sections").select("id").eq("exam_id", question.exam_id);
  await Promise.all((sections ?? []).map(item => admin.from("exam_sections").update({ max_score: Number((sectionTotals.get(item.id) ?? 0).toFixed(2)) }).eq("id", item.id)));
  await admin.from("exams").update({ total_score: Number(totalScore.toFixed(2)) }).eq("id", question.exam_id);

  const { error: keyError } = await admin.from("answer_keys").update({
    grading_type: gradingType,
    correct_choice_id: question.type === "single_choice" ? correctChoiceId : null,
    correct_value: question.type === "single_choice" ? null : nullable(formData, "correctValue"),
    accepted_values: [...new Set(acceptedValues)],
    decimal_places: decimalPlaces,
    tolerance,
    case_sensitive: formData.get("caseSensitive") === "on",
    explanation: nullable(formData, "explanation"),
  }).eq("question_id", id);
  if (keyError) redirectMessage(returnTo, "error", `정답 저장 실패: ${keyError.message}`);

  const choiceResults = await Promise.all(
    [...choiceIds].map((choiceId) =>
      admin.from("question_choices").update({ content: choiceContents.get(choiceId)! }).eq("id", choiceId).eq("question_id", id),
    ),
  );
  const choiceError = choiceResults.find((result) => result.error)?.error;
  if (choiceError) redirectMessage(returnTo, "error", `보기 저장 실패: ${choiceError.message}`);

  revalidatePath(returnTo.split("?")[0]);
  revalidatePath(`/admin/exams/${question.exam_id}`);
  revalidatePath("/exams");
  redirectMessage(returnTo, "saved", "문항과 정답을 저장했습니다.");
}

type DiagnosticInput = {
  sectionCode: string | null;
  competencyTag: string | null;
  minPercentage: number;
  maxPercentage: number;
  level: DiagnosticLevel;
  comment: string;
  recommendation: string | null;
  priority: number;
  isActive: boolean;
};

function diagnosticInput(formData: FormData): DiagnosticInput {
  const sectionCode = nullable(formData, "sectionCode");
  const competencyTag = nullable(formData, "competencyTag");
  const minPercentage = numberValue(formData, "minPercentage");
  const maxPercentage = numberValue(formData, "maxPercentage");
  const level = text(formData, "level") as DiagnosticLevel;
  const comment = text(formData, "comment");
  const priority = numberValue(formData, "priority");
  if (sectionCode && competencyTag) throw new Error("영역과 역량을 동시에 지정할 수 없습니다.");
  if (minPercentage < 0 || maxPercentage > 100 || minPercentage > maxPercentage || !diagnosticLevels.includes(level) || !comment || priority < -32768 || priority > 32767) throw new Error("진단 규칙 입력값을 확인해 주세요.");
  return { sectionCode, competencyTag, minPercentage, maxPercentage, level, comment, recommendation: nullable(formData, "recommendation"), priority: Math.round(priority), isActive: formData.get("isActive") === "on" };
}

// NOTE: read-then-write check, not a DB constraint — two admins creating/activating overlapping
// rules for the same section/tag at the same moment could both pass this check before either
// insert commits. Acceptable for now (admin-only, low-traffic, low-stakes); a real fix needs a
// DB-level exclusion constraint on (section_code, competency_tag, percentage range).
async function ensureNoDiagnosticOverlap(input: DiagnosticInput, excludeId?: string) {
  if (!input.isActive) return;
  const admin = createAdminClient();
  const { data, error } = await admin.from("diagnostic_rules").select("id,section_code,competency_tag,min_percentage,max_percentage,is_active");
  if (error) throw new Error("진단 규칙 중복을 확인하지 못했습니다.");
  const overlap = (data ?? []).some(rule => rule.id !== excludeId && rule.is_active && rule.section_code === input.sectionCode && rule.competency_tag === input.competencyTag && input.minPercentage <= Number(rule.max_percentage) && input.maxPercentage >= Number(rule.min_percentage));
  if (overlap) throw new Error("같은 영역 또는 역량에 겹치는 활성 점수 구간이 있습니다.");
}

export async function updateDiagnosticRuleAction(formData: FormData) {
  await assertAdminAction();
  const id = text(formData, "id");
  const returnTo = resolveReturnTo(formData, "/admin/diagnostics");
  const input = parseOrRedirect(returnTo, () => diagnosticInput(formData));
  await ensureNoDiagnosticOverlap(input, id).catch((error: unknown) => redirectMessage(returnTo, "error", error instanceof Error ? error.message : "진단 규칙을 확인해 주세요."));
  const admin = createAdminClient();
  const { error } = await admin.from("diagnostic_rules").update({
    section_code: input.sectionCode, competency_tag: input.competencyTag,
    min_percentage: input.minPercentage, max_percentage: input.maxPercentage,
    level: input.level, comment: input.comment, recommendation: input.recommendation,
    priority: input.priority, is_active: input.isActive,
  }).eq("id", id);
  if (error) redirectMessage(returnTo, "error", `규칙 저장 실패: ${error.message}`);
  revalidatePath("/admin/diagnostics");
  redirectMessage(returnTo, "saved", "진단 규칙을 저장했습니다.");
}

export async function createDiagnosticRuleAction(formData: FormData) {
  await assertAdminAction();
  const returnTo = resolveReturnTo(formData, "/admin/diagnostics");
  const input = parseOrRedirect(returnTo, () => diagnosticInput(formData));
  await ensureNoDiagnosticOverlap(input).catch((error: unknown) => redirectMessage(returnTo, "error", error instanceof Error ? error.message : "진단 규칙을 확인해 주세요."));
  const admin = createAdminClient();
  const { error } = await admin.from("diagnostic_rules").insert({
    section_code: input.sectionCode, competency_tag: input.competencyTag,
    min_percentage: input.minPercentage, max_percentage: input.maxPercentage,
    level: input.level, comment: input.comment, recommendation: input.recommendation,
    priority: input.priority, is_active: input.isActive,
  });
  if (error) redirectMessage(returnTo, "error", `규칙 추가 실패: ${error.message}`);
  revalidatePath("/admin/diagnostics");
  redirectMessage(returnTo, "saved", "새 진단 규칙을 추가했습니다.");
}

export async function deleteDiagnosticRuleAction(formData: FormData) {
  await assertAdminAction();
  const admin = createAdminClient();
  const id = text(formData, "id");
  const returnTo = resolveReturnTo(formData, "/admin/diagnostics");
  const { data: rule } = await admin.from("diagnostic_rules").select("section_code,competency_tag").eq("id", id).maybeSingle();
  if (!rule) redirectMessage(returnTo, "error", "삭제할 규칙을 찾을 수 없습니다.");
  if (!rule.section_code && !rule.competency_tag) redirectMessage(returnTo, "error", "공통 기본 규칙은 삭제할 수 없습니다.");
  const { error } = await admin.from("diagnostic_rules").delete().eq("id", id);
  if (error) redirectMessage(returnTo, "error", `규칙 삭제 실패: ${error.message}`);
  revalidatePath("/admin/diagnostics");
  redirectMessage(returnTo, "saved", "진단 규칙을 삭제했습니다.");
}

type ScheduleInput = { certificationId: string; roundName: string; examDate: string | null; applyStart: string | null; applyEnd: string | null; notes: string | null; sortOrder: number };

function scheduleInput(formData: FormData): ScheduleInput {
  const certificationId = text(formData, "certificationId");
  const roundName = text(formData, "roundName");
  const sortOrder = numberValue(formData, "sortOrder");
  if (!certificationId || !roundName) throw new Error("자격증과 회차명을 입력해 주세요.");
  return {
    certificationId, roundName,
    examDate: nullable(formData, "examDate"), applyStart: nullable(formData, "applyStart"), applyEnd: nullable(formData, "applyEnd"),
    notes: nullable(formData, "notes"), sortOrder: Math.round(sortOrder),
  };
}

function revalidateLicenseSchedules(code: string) {
  revalidatePath("/admin/license-schedules");
  revalidatePath(`/license/${code}`);
}

export async function createLicenseScheduleAction(formData: FormData) {
  await assertAdminAction();
  const returnTo = resolveReturnTo(formData, "/admin/license-schedules");
  const input = parseOrRedirect(returnTo, () => scheduleInput(formData));
  const admin = createAdminClient();
  const { error } = await admin.from("certification_schedules").insert({
    certification_id: input.certificationId, round_name: input.roundName, exam_date: input.examDate,
    apply_start: input.applyStart, apply_end: input.applyEnd, notes: input.notes, sort_order: input.sortOrder,
  });
  if (error) redirectMessage(returnTo, "error", `일정 추가 실패: ${error.message}`);
  revalidateLicenseSchedules(text(formData, "certificationCode"));
  redirectMessage(returnTo, "saved", "새 시험 일정을 추가했습니다.");
}

export async function updateLicenseScheduleAction(formData: FormData) {
  await assertAdminAction();
  const id = text(formData, "id");
  const returnTo = resolveReturnTo(formData, "/admin/license-schedules");
  const input = parseOrRedirect(returnTo, () => scheduleInput(formData));
  const admin = createAdminClient();
  const { error } = await admin.from("certification_schedules").update({
    round_name: input.roundName, exam_date: input.examDate, apply_start: input.applyStart,
    apply_end: input.applyEnd, notes: input.notes, sort_order: input.sortOrder,
  }).eq("id", id);
  if (error) redirectMessage(returnTo, "error", `일정 저장 실패: ${error.message}`);
  revalidateLicenseSchedules(text(formData, "certificationCode"));
  redirectMessage(returnTo, "saved", "시험 일정을 저장했습니다.");
}

export async function deleteLicenseScheduleAction(formData: FormData) {
  await assertAdminAction();
  const admin = createAdminClient();
  const id = text(formData, "id");
  const returnTo = resolveReturnTo(formData, "/admin/license-schedules");
  const { error } = await admin.from("certification_schedules").delete().eq("id", id);
  if (error) redirectMessage(returnTo, "error", `일정 삭제 실패: ${error.message}`);
  revalidateLicenseSchedules(text(formData, "certificationCode"));
  redirectMessage(returnTo, "saved", "시험 일정을 삭제했습니다.");
}
