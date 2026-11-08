import Link from "next/link";
import { ChevronLeft, ChevronRight, UserPlus, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { kstDateTime, kstDay, listAllUsers } from "@/lib/admin-users";

const PAGE_SIZE = 10;
const providerLabel: Record<string, string> = { email: "이메일", google: "Google", kakao: "카카오", naver: "네이버" };

async function loadMembers() {
  const admin = createAdminClient();
  const [users, { data: attempts, error }] = await Promise.all([
    listAllUsers(admin),
    admin.from("attempts").select("user_id"),
  ]);
  if (error || !attempts) throw new Error("응시 기록을 불러오지 못했습니다.");

  const attemptCountByUserId = new Map<string, number>();
  for (const attempt of attempts) attemptCountByUserId.set(attempt.user_id, (attemptCountByUserId.get(attempt.user_id) ?? 0) + 1);
  const members = users
    .map((user) => ({ ...user, attemptCount: attemptCountByUserId.get(user.id) ?? 0 }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { members, now: Date.now() };
}

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const query = await searchParams;
  const { members, now } = await loadMembers();
  const totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number(query.page ?? "1") || 1));
  const pageMembers = members.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // 페이지 번호는 현재 페이지를 중심으로 최대 10개만 보여 준다
  const firstPage = Math.max(1, Math.min(page - 4, totalPages - 9));
  const pageNumbers = Array.from({ length: Math.min(10, totalPages) }, (_, index) => firstPage + index);
  const pageHref = (n: number) => n === 1 ? "/admin/members" : `/admin/members?page=${n}`;
  const daysAgo = (days: number) => kstDay(now - days * 86_400_000);
  const countSince = (since: string) => members.filter((member) => kstDay(member.createdAt) >= since).length;
  const stats = {
    total: members.length,
    today: countSince(daysAgo(0)),
    week: countSince(daysAgo(6)),
    month: countSince(daysAgo(29)),
  };
  const tested = members.filter((member) => member.attemptCount > 0).length;

  return <main className="admin-content">
    <header className="admin-page-head compact">
      <div><span>MEMBERS</span><h1>회원가입 현황</h1><p>가입 회원 수와 회원별 응시 여부를 확인합니다. 날짜는 한국 시간 기준입니다.</p></div>
    </header>

    <section className="admin-stats">
      <article><Users /><div><span>전체 회원</span><strong>{stats.total}</strong></div></article>
      <article><UserPlus /><div><span>오늘 가입</span><strong>{stats.today}</strong></div></article>
      <article><UserPlus /><div><span>최근 7일 가입</span><strong>{stats.week}</strong></div></article>
      <article><UserPlus /><div><span>최근 30일 가입</span><strong>{stats.month}</strong></div></article>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><span>MEMBERS</span><h2>회원 목록</h2></div><small>최근 가입순 {members.length}명 · 응시 1회 이상 {tested}명 · {page}/{totalPages}쪽</small></div>
      {members.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>가입일시</th><th>이메일</th><th>가입 방식</th><th>마지막 로그인</th><th>응시 수</th></tr></thead>
        <tbody>{pageMembers.map((member) => <tr key={member.id}>
          <td>{kstDateTime(member.createdAt)}</td>
          <td>{member.email ?? "-"}</td>
          <td>{providerLabel[member.provider] ?? member.provider}</td>
          <td>{kstDateTime(member.lastSignInAt)}</td>
          <td>{member.attemptCount ? `${member.attemptCount}회` : "-"}</td>
        </tr>)}</tbody>
      </table></div> : <p>가입한 회원이 없습니다.</p>}
      {totalPages > 1 && <nav className="admin-pagination" aria-label="회원 목록 페이지">
        {page > 1 ? <Link href={pageHref(page - 1)} aria-label="이전 페이지"><ChevronLeft /></Link> : <span aria-hidden><ChevronLeft /></span>}
        {pageNumbers.map((n) => <Link key={n} href={pageHref(n)} className={n === page ? "active" : ""} aria-current={n === page ? "page" : undefined}>{n}</Link>)}
        {page < totalPages ? <Link href={pageHref(page + 1)} aria-label="다음 페이지"><ChevronRight /></Link> : <span aria-hidden><ChevronRight /></span>}
      </nav>}
    </section>
  </main>;
}
