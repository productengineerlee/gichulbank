"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function resolveCertificationId(supabase: Awaited<ReturnType<typeof createClient>>, categoryCode: string) {
  // "general"(일반)은 특정 자격증에 속하지 않는 글.
  if (!categoryCode || categoryCode === "general") return null;
  const { data: cert } = await supabase.from("certifications").select("id").eq("code", categoryCode).maybeSingle();
  return cert?.id ?? null;
}

export async function createQnaPostAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/qna/new");

  const title = text(formData, "title");
  const content = text(formData, "content");
  const categoryCode = text(formData, "categoryCode");
  if (!title || !content) redirect(`/qna/new?error=${encodeURIComponent("제목과 내용을 입력해 주세요.")}`);

  const certificationId = await resolveCertificationId(supabase, categoryCode);
  const { data: inserted, error } = await supabase
    .from("qna_posts")
    .insert({ user_id: user.id, certification_id: certificationId, title, content })
    .select("id")
    .single();
  if (error || !inserted) redirect(`/qna/new?error=${encodeURIComponent("게시글 등록에 실패했습니다.")}`);

  revalidatePath("/qna");
  redirect(`/qna/${inserted.id}`);
}

export async function updateQnaPostAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const id = text(formData, "id");
  const title = text(formData, "title");
  const content = text(formData, "content");
  const categoryCode = text(formData, "categoryCode");
  if (!title || !content) redirect(`/qna/${id}/edit?error=${encodeURIComponent("제목과 내용을 입력해 주세요.")}`);

  const certificationId = await resolveCertificationId(supabase, categoryCode);
  const { error } = await supabase.from("qna_posts").update({ title, content, certification_id: certificationId }).eq("id", id);
  if (error) redirect(`/qna/${id}/edit?error=${encodeURIComponent("수정에 실패했습니다.")}`);

  revalidatePath("/qna");
  revalidatePath(`/qna/${id}`);
  redirect(`/qna/${id}`);
}

export async function deleteQnaPostAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const id = text(formData, "id");
  await supabase.from("qna_posts").delete().eq("id", id);

  revalidatePath("/qna");
  redirect("/qna");
}

export async function createQnaCommentAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const postId = text(formData, "postId");
  if (!user) redirect(`/auth/login?next=/qna/${postId}`);

  const content = text(formData, "content");
  if (content) {
    const { error } = await supabase.from("qna_comments").insert({ post_id: postId, user_id: user.id, content });
    if (error) redirect(`/qna/${postId}?error=${encodeURIComponent("답변 등록에 실패했습니다.")}`);
  }

  revalidatePath(`/qna/${postId}`);
  redirect(`/qna/${postId}`);
}

export async function deleteQnaCommentAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const id = text(formData, "id");
  const postId = text(formData, "postId");
  await supabase.from("qna_comments").delete().eq("id", id);

  revalidatePath(`/qna/${postId}`);
  redirect(`/qna/${postId}`);
}
