import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, EyeOff, MessageSquareText, Star } from "lucide-react";
import { setReviewHiddenAction } from "@/app/admin/actions";
import { kstDateTime, listAllUsers } from "@/lib/admin-users";
import { REVIEW_MIN } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, withRetry } from "@/lib/supabase/paging";

const PAGE_SIZE = 10;

type Row = { id: string; user_id: string; certification_id: string; exam_id: string; rating: number; comment: string | null; is_hidden: boolean; created_at: string; updated_at: string };

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ cert?: string; page?: string; saved?: string; error?: string }> }) {
  const query = await searchParams;
  const admin = createAdminClient();
  const [loaded, certs, exams, users] = await Promise.all([
    fetchAll<Row>((from, to) => admin.from("exam_reviews").select("id,user_id,certification_id,exam_id,rating,comment,is_hidden,created_at,updated_at")
      .order("created_at", { ascending: false }).order("id").range(from, to), "후기를 불러오지 못했습니다.").catch(() => null),
    withRetry("certifications", () => admin.from("certifications").select("id,name"), "자격증을 불러오지 못했습니다."),
    withRetry("exams", () => admin.from("exams").select("id,title"), "시험을 불러오지 못했습니다."),
    listAllUsers(admin),
  ]);
  // 후기 표가 아직 없으면(마이그레이션 전) 안내만 보여 준다.
  const tableMissing = loaded === null;
  const reviews = loaded ?? [];
  const certName = new Map((certs ?? []).map((cert) => [cert.id, cert.name]));
  const examTitle = new Map((exams ?? []).map((exam) => [exam.id, exam.title]));
  const emailOf = new Map(users.map((user) => [user.id, user.email]));

  const certNames = [...new Set(reviews.map((review) => certName.get(review.certification_id) ?? "알 수 없음"))].sort((a, b) => a.localeCompare(b, "ko"));
  const filtered = query.cert ? reviews.filter((review) => certName.get(review.certification_id) === query.cert) : reviews;
  const visible = filtered.filter((review) => !review.is_hidden);
  const average = visible.length ? (visible.reduce((sum, review) => sum + review.rating, 0) / visible.length).toFixed(1) : "-";

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number(query.page ?? "1") || 1));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const firstPage = Math.max(1, Math.min(page - 4, totalPages - 9));
  const pageNumbers = Array.from({ length: Math.min(10, totalPages) }, (_, index) => firstPage + index);
  const href = (next: { cert?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const cert = next.cert === null ? undefined : (next.cert ?? query.cert);
    if (cert) params.set("cert", cert);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const search = params.toString();
    return `/admin/reviews${search ? `?${search}` : ""}`;
  };
  const returnTo = href({ page });

  return <main className="admin-content">
    <header className="admin-page-head compact">
      <div><span>REVIEWS</span><h1>회차 후기 관리</h1><p>회차를 제출한 회원이 남긴 별점과 한 줄 평입니다. 숨긴 후기는 평균 별점과 공개 목록에서 빠집니다. 자격증별 공개 후기가 {REVIEW_MIN}개 이상일 때만 사용자 화면에 보입니다.</p></div>
    </header>
    {query.saved && <div className="admin-message success">{query.saved}</div>}{query.error && <div className="admin-message error">{query.error}</div>}
    {tableMissing && <div className="admin-message error">후기 표(exam_reviews)가 아직 없습니다. Supabase SQL Editor에서 마이그레이션 202611100014_exam_reviews.sql 을 실행해 주세요.</div>}

    <section className="admin-stats">
      <article><MessageSquareText /><div><span>전체 후기</span><strong>{filtered.length}</strong></div></article>
      <article><Eye /><div><span>공개</span><strong>{visible.length}</strong></div></article>
      <article><EyeOff /><div><span>숨김</span><strong>{filtered.length - visible.length}</strong></div></article>
      <article><Star /><div><span>공개 평균 별점</span><strong>{average}</strong></div></article>
    </section>

    <section className="admin-panel">
      <div className="tag-filter">
        <Link className={!query.cert ? "active" : ""} href={href({ cert: null })}>전체</Link>
        {certNames.map((name) => <Link key={name} className={query.cert === name ? "active" : ""} href={href({ cert: name })}>{name}</Link>)}
      </div>
      <div className="admin-panel-head"><div><span>LIST</span><h2>후기 목록</h2></div><small>최근 작성순 {filtered.length}건 · {page}/{totalPages}쪽</small></div>
      {pageRows.length ? <div className="admin-table-wrap"><table className="admin-table review-table">
        <thead><tr><th>작성일시</th><th>한 줄 평</th><th>별점</th><th>회차</th><th>이메일</th><th>상태</th></tr></thead>
        <tbody>{pageRows.map((review) => <tr key={review.id} className={review.is_hidden ? "hidden-row" : ""}>
          <td>{kstDateTime(review.created_at)}</td>
          <td>{review.comment || <span className="muted">(별점만)</span>}</td>
          <td>{"★".repeat(review.rating)}<span className="muted">{"★".repeat(5 - review.rating)}</span></td>
          <td>{certName.get(review.certification_id) ?? "-"}<br /><small>{examTitle.get(review.exam_id) ?? "삭제된 회차"}</small></td>
          <td>{emailOf.get(review.user_id) ?? "탈퇴한 회원"}</td>
          <td><form action={setReviewHiddenAction}>
            <input type="hidden" name="id" value={review.id} /><input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="hidden" value={review.is_hidden ? "false" : "true"} />
            <button className="admin-secondary review-toggle">{review.is_hidden ? <><Eye />다시 공개</> : <><EyeOff />숨기기</>}</button>
          </form></td>
        </tr>)}</tbody>
      </table></div> : <p>아직 남겨진 후기가 없습니다.</p>}
      {totalPages > 1 && <nav className="admin-pagination" aria-label="후기 목록 페이지">
        {page > 1 ? <Link href={href({ page: page - 1 })} aria-label="이전 페이지"><ChevronLeft /></Link> : <span aria-hidden><ChevronLeft /></span>}
        {pageNumbers.map((n) => <Link key={n} href={href({ page: n })} className={n === page ? "active" : ""} aria-current={n === page ? "page" : undefined}>{n}</Link>)}
        {page < totalPages ? <Link href={href({ page: page + 1 })} aria-label="다음 페이지"><ChevronRight /></Link> : <span aria-hidden><ChevronRight /></span>}
      </nav>}
    </section>
  </main>;
}
