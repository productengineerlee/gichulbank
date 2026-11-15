import Link from "next/link";
import { redirect } from "next/navigation";
import { ExamHeader } from "@/components/exams/exam-header";
import { createClient } from "@/lib/supabase/server";
import { listQnaCategories, listQnaPosts } from "@/lib/qna";
import "../exams/exams.css";
import "./qna.css";

export const dynamic = "force-dynamic";

export default async function QnaPage({ searchParams }: { searchParams: Promise<{ category?: string; page?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/qna");

  const params = await searchParams;
  const categories = await listQnaCategories();
  const selectedCode = params.category && categories.some((c) => c.code === params.category) ? params.category : undefined;
  const selectedCategory = categories.find((c) => c.code === selectedCode);
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const { posts, total, pageSize } = await listQnaPosts({
    hasCategory: !!selectedCode,
    categoryId: selectedCategory ? selectedCategory.id : undefined,
    page,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const categoryQuery = selectedCode ? `category=${selectedCode}&` : "";

  return (
    <main className="exam-app">
      <ExamHeader />
      <section className="exam-container">
        <div className="exam-titlebar">
          <div><h1>개선요청</h1></div>
          <p>문제·정답·해설 오류, 불편한 점, 바라는 기능을 알려 주세요. 확인 후 답변드려요.</p>
        </div>
        <div className="qna-toolbar">
          <div className="qna-filters">
            <Link href="/qna" className={!selectedCode ? "active" : ""}>전체</Link>
            {categories.map((c) => (
              <Link key={c.code} href={`/qna?category=${c.code}`} className={selectedCode === c.code ? "active" : ""}>{c.name}</Link>
            ))}
          </div>
          <Link className="qna-write-btn" href="/qna/new">글쓰기</Link>
        </div>
        {posts.length === 0 ? (
          <p className="license-empty">등록된 개선요청이 없습니다. 첫 요청을 남겨 보세요.</p>
        ) : (
          <ul className="qna-list">
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/qna/${post.id}`}>
                  <span className="qna-cat">{post.categoryName}</span>
                  <span className="qna-title">{post.title}</span>
                  <span className="qna-comment-count">{post.commentCount}</span>
                </Link>
                <div className="qna-meta"><span>{post.authorName}</span><span>{new Date(post.createdAt).toLocaleDateString("ko-KR")}</span></div>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <nav className="qna-pagination">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link key={n} href={`/qna?${categoryQuery}page=${n}`} className={n === page ? "active" : ""}>{n}</Link>
            ))}
          </nav>
        )}
      </section>
    </main>
  );
}
