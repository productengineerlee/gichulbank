import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/supabase/paging";
import { topicOf } from "@/lib/explanation";

export type ExplanationQuestion = {
  number: number;
  topic: string | null;
  tags: string[];
  sectionTitle: string | null;
  score: number;
  prompt: string;
  imageUrl: string | null;
  choices: { label: string; content: string }[];
  correctLabel: string | null;
  explanation: string | null;
};

export type RoundExplanation = {
  slug: string;
  title: string;
  certCode: string;
  certName: string;
  publishedAt: string | null;
  updatedAt: string;
  questions: ExplanationQuestion[];
};

/** 공개된 자격증 회차의 문항·정답·해설을 번호순으로 불러온다. 로그인 없이 보는 해설 페이지용. */
export async function loadRoundExplanation(slug: string): Promise<RoundExplanation | null> {
  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("id,slug,title,certification_id,published_at,updated_at").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!exam?.certification_id) return null;
  const { data: cert } = await admin.from("certifications").select("code,name").eq("id", exam.certification_id).eq("is_active", true).maybeSingle();
  if (!cert) return null;

  const [questions, sections] = await Promise.all([
    fetchAll((from, to) => admin.from("questions").select("id,section_id,number,prompt,image_url,score,competency_tags")
      .eq("exam_id", exam.id).eq("is_active", true).order("number").order("id").range(from, to)),
    fetchAll((from, to) => admin.from("exam_sections").select("id,title").eq("exam_id", exam.id).order("id").range(from, to)),
  ]);
  const ids = questions.map((question) => question.id);
  const [choices, keys] = await Promise.all([
    fetchByIds(ids, (chunk, from, to) => admin.from("question_choices").select("id,question_id,label,content,sort_order").in("question_id", chunk).order("question_id").order("sort_order").range(from, to)),
    fetchByIds(ids, (chunk, from, to) => admin.from("answer_keys").select("question_id,correct_choice_id,explanation").in("question_id", chunk).order("question_id").range(from, to)),
  ]);
  const choicesByQuestion = Map.groupBy(choices, (choice) => choice.question_id);
  const keyByQuestion = new Map(keys.map((key) => [key.question_id, key]));
  const sectionTitle = new Map(sections.map((section) => [section.id, section.title]));
  const labelByChoiceId = new Map(choices.map((choice) => [choice.id, choice.label]));

  return {
    slug: exam.slug,
    title: exam.title,
    certCode: cert.code,
    certName: cert.name,
    publishedAt: exam.published_at,
    updatedAt: exam.updated_at,
    questions: questions.map((question) => {
      const key = keyByQuestion.get(question.id);
      return {
        number: question.number,
        topic: topicOf(question.competency_tags),
        tags: question.competency_tags,
        sectionTitle: sectionTitle.get(question.section_id) ?? null,
        score: Number(question.score),
        prompt: question.prompt,
        imageUrl: question.image_url,
        choices: (choicesByQuestion.get(question.id) ?? []).map((choice) => ({ label: choice.label, content: choice.content })),
        correctLabel: key?.correct_choice_id ? labelByChoiceId.get(key.correct_choice_id) ?? null : null,
        explanation: key?.explanation?.trim() || null,
      };
    }),
  };
}

/** 사이트맵용: 공개된 자격증 회차 목록 */
export async function listExplanationRounds() {
  const admin = createAdminClient();
  const [{ data: exams }, { data: certs }] = await Promise.all([
    admin.from("exams").select("slug,certification_id,updated_at").eq("status", "published").not("certification_id", "is", null),
    admin.from("certifications").select("id,code").eq("is_active", true),
  ]);
  const activeCert = new Map((certs ?? []).map((cert) => [cert.id, cert.code]));
  return {
    certCodes: [...activeCert.values()],
    rounds: (exams ?? []).filter((exam) => exam.certification_id && activeCert.has(exam.certification_id)).map((exam) => ({ slug: exam.slug, updatedAt: exam.updated_at })),
  };
}
