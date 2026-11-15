import Link from "next/link";
import { redirect } from "next/navigation";
import { ExamHeader } from "@/components/exams/exam-header";
import { createClient } from "@/lib/supabase/server";
import { listQnaCategories } from "@/lib/qna";
import { createQnaPostAction } from "../actions";
import "../../exams/exams.css";
import "../qna.css";

export const dynamic = "force-dynamic";

export default async function NewQnaPostPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/qna/new");

  const { error } = await searchParams;
  const categories = await listQnaCategories();

  return (
    <main className="exam-app">
      <ExamHeader />
      <section className="exam-container qna-form-container">
        <div className="exam-titlebar"><div><h1>개선요청 작성</h1></div></div>
        {error && <p className="qna-error">{error}</p>}
        <form action={createQnaPostAction} className="qna-form">
          <label>
            자격증 선택
            <select name="categoryCode" required defaultValue="general">
              {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label>
            제목
            <input type="text" name="title" required maxLength={200} placeholder="제목을 입력하세요 (예: 한국사 79회 17번 정답 확인 요청)" />
          </label>
          <label>
            내용
            <textarea name="content" required rows={10} placeholder="궁금한 내용을 자세히 적어주세요" />
          </label>
          <div className="qna-form-actions">
            <Link href="/qna" className="qna-cancel">취소</Link>
            <button type="submit">등록</button>
          </div>
        </form>
      </section>
    </main>
  );
}
