import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExamHeader } from "@/components/exams/exam-header";
import { createClient } from "@/lib/supabase/server";
import { getQnaPost, listQnaCategories } from "@/lib/qna";
import { updateQnaPostAction } from "../../actions";
import "../../../exams/exams.css";
import "../../qna.css";

export const dynamic = "force-dynamic";

export default async function EditQnaPostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=/qna/${id}/edit`);

  const [{ data: profile }, post, { error }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    getQnaPost(id),
    searchParams,
  ]);
  if (!post) notFound();
  if (post.authorId !== user.id && profile?.role !== "admin") redirect(`/qna/${id}`);

  const categories = await listQnaCategories();

  return (
    <main className="exam-app">
      <ExamHeader />
      <section className="exam-container qna-form-container">
        <div className="exam-titlebar"><div><h1>개선요청 수정</h1></div></div>
        {error && <p className="qna-error">{error}</p>}
        <form action={updateQnaPostAction} className="qna-form">
          <input type="hidden" name="id" value={post.id} />
          <label>
            자격증 선택
            <select name="categoryCode" required defaultValue={post.categoryCode}>
              {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label>
            제목
            <input type="text" name="title" required maxLength={200} defaultValue={post.title} />
          </label>
          <label>
            내용
            <textarea name="content" required rows={10} defaultValue={post.content} />
          </label>
          <div className="qna-form-actions">
            <Link href={`/qna/${post.id}`} className="qna-cancel">취소</Link>
            <button type="submit">저장</button>
          </div>
        </form>
      </section>
    </main>
  );
}
