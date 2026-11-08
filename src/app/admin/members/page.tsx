import Link from "next/link";
import { ChevronLeft, ChevronRight, UserPlus, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { kstDateTime, kstDay, listAllUsers } from "@/lib/admin-users";

const PAGE_SIZE = 10;
const AICE_LABEL = "AICE";
const NO_ATTEMPT = "미응시";
const providerLabel: Record<string, string> = { email: "이메일", google: "Google", kakao: "카카오", naver: "네이버" };

async function loadMembers() {
  const admin = createAdminClient();
  // Supabase 는 한 번에 최대 1,000행만 돌려주므로 응시 기록은 나눠 읽는다
  const loadAllAttempts = async () => {
    const rows: { user_id: string; exam_id: string; started_at: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("attempts").select("user_id,exam_id,started_at")
        .order("started_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
      if (error || !data) throw new Error("응시 기록을 불러오지 못했습니다.");
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  };
  const [users, attempts, examsResult, certsResult] = await Promise.all([
    listAllUsers(admin),
    loadAllAttempts(),
    admin.from("exams").select("id,certification_id"),
    admin.from("certifications").select("id,name,sort_order"),
  ]);
  const { data: exams } = examsResult;
  const { data: certs } = certsResult;
  if (examsResult.error || certsResult.error || !exams || !certs) throw new Error("시험 정보를 불러오지 못했습니다.");

  const certIdByExamId = new Map(exams.map((exam) => [exam.id, exam.certification_id]));
  const certNameById = new Map(certs.map((cert) => [cert.id, cert.name]));
  const courseOfExam = (examId: string) => {
    const certId = certIdByExamId.get(examId);
    return certId ? (certNameById.get(certId) ?? "알 수 없음") : AICE_LABEL;
  };

  // 응시 기록이 시작 순으로 정렬돼 있으므로 회원별 첫 기록이 첫 응시 과정이다
  const attemptCountByUserId = new Map<string, number>();
  const firstCourseByUserId = new Map<string, string>();
  for (const attempt of attempts) {
    attemptCountByUserId.set(attempt.user_id, (attemptCountByUserId.get(attempt.user_id) ?? 0) + 1);
    if (!firstCourseByUserId.has(attempt.user_id)) firstCourseByUserId.set(attempt.user_id, courseOfExam(attempt.exam_id));
  }
  const members = users
    .map((user) => ({ ...user, attemptCount: attemptCountByUserId.get(user.id) ?? 0, course: firstCourseByUserId.get(user.id) ?? NO_ATTEMPT }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // 과정 순서: 자격증 정렬 순서 → AICE → 그 밖 → 미응시
  const certOrder = new Map(certs.map((cert) => [cert.name, cert.sort_order ?? 0]));
  const courseRank = (course: string) => course === NO_ATTEMPT ? 3 : certOrder.has(course) ? 0 : course === AICE_LABEL ? 1 : 2;
  const courseSort = (a: string, b: string) => courseRank(a) - courseRank(b) || (certOrder.get(a) ?? 0) - (certOrder.get(b) ?? 0) || a.localeCompare(b, "ko");
  return { members, courseSort, now: Date.now() };
}

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ page?: string; course?: string }> }) {
  const query = await searchParams;
  const { members, courseSort, now } = await loadMembers();
  const daysAgo = (days: number) => kstDay(now - days * 86_400_000);
  const weekStart = daysAgo(6);
  const monthStart = daysAgo(29);
  const countSince = (list: typeof members, since: string) => list.filter((member) => kstDay(member.createdAt) >= since).length;
  const stats = {
    total: members.length,
    today: countSince(members, daysAgo(0)),
    week: countSince(members, weekStart),
    month: countSince(members, monthStart),
  };

  const courses = [...new Set(members.map((member) => member.course))].sort(courseSort).map((course) => {
    const list = members.filter((member) => member.course === course);
    return { course, total: list.length, week: countSince(list, weekStart), month: countSince(list, monthStart) };
  });

  const course = query.course && courses.some((item) => item.course === query.course) ? query.course : undefined;
  const filtered = course ? members.filter((member) => member.course === course) : members;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number(query.page ?? "1") || 1));
  const pageMembers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // 페이지 번호는 현재 페이지를 중심으로 최대 10개만 보여 준다
  const firstPage = Math.max(1, Math.min(page - 4, totalPages - 9));
  const pageNumbers = Array.from({ length: Math.min(10, totalPages) }, (_, index) => firstPage + index);
  const href = (next: { page?: number; course?: string | null }) => {
    const params = new URLSearchParams();
    const nextCourse = next.course === null ? undefined : (next.course ?? course);
    if (nextCourse) params.set("course", nextCourse);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const search = params.toString();
    return `/admin/members${search ? `?${search}` : ""}`;
  };

  return <main className="admin-content">
    <header className="admin-page-head compact">
      <div><span>MEMBERS</span><h1>회원가입 현황</h1><p>가입 회원 수와 과정별 회원을 확인합니다. 과정은 회원이 처음 응시한 시험의 자격증 기준이며, 날짜는 한국 시간 기준입니다.</p></div>
    </header>

    <section className="admin-stats">
      <article><Users /><div><span>전체 회원</span><strong>{stats.total}</strong></div></article>
      <article><UserPlus /><div><span>오늘 가입</span><strong>{stats.today}</strong></div></article>
      <article><UserPlus /><div><span>최근 7일 가입</span><strong>{stats.week}</strong></div></article>
      <article><UserPlus /><div><span>최근 30일 가입</span><strong>{stats.month}</strong></div></article>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><span>BY COURSE</span><h2>과정별 회원</h2></div><small>첫 응시 과정 기준 · 과정을 누르면 아래 목록이 걸러집니다</small></div>
      <div className="admin-table-wrap"><table className="admin-table course-table">
        <thead><tr><th>과정</th><th>회원 수</th><th>비율</th><th>최근 7일 가입</th><th>최근 30일 가입</th></tr></thead>
        <tbody>{courses.map((item) => <tr key={item.course} className={item.course === course ? "selected" : ""}>
          <td><Link href={href({ course: item.course === course ? null : item.course })}>{item.course}</Link></td>
          <td>{item.total}명</td>
          <td>{stats.total ? Math.round((item.total / stats.total) * 1000) / 10 : 0}%</td>
          <td>{item.week}</td>
          <td>{item.month}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><span>MEMBERS</span><h2>회원 목록{course ? ` · ${course}` : ""}</h2></div><small>{course && <><Link href={href({ course: null })}>전체 보기</Link> · </>}최근 가입순 {filtered.length}명 · {page}/{totalPages}쪽</small></div>
      {pageMembers.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>가입일시</th><th>이메일</th><th>첫 응시 과정</th><th>가입 방식</th><th>마지막 로그인</th><th>응시 수</th></tr></thead>
        <tbody>{pageMembers.map((member) => <tr key={member.id}>
          <td>{kstDateTime(member.createdAt)}</td>
          <td>{member.email ?? "-"}</td>
          <td>{member.course}</td>
          <td>{providerLabel[member.provider] ?? member.provider}</td>
          <td>{kstDateTime(member.lastSignInAt)}</td>
          <td>{member.attemptCount ? `${member.attemptCount}회` : "-"}</td>
        </tr>)}</tbody>
      </table></div> : <p>가입한 회원이 없습니다.</p>}
      {totalPages > 1 && <nav className="admin-pagination" aria-label="회원 목록 페이지">
        {page > 1 ? <Link href={href({ page: page - 1 })} aria-label="이전 페이지"><ChevronLeft /></Link> : <span aria-hidden><ChevronLeft /></span>}
        {pageNumbers.map((n) => <Link key={n} href={href({ page: n })} className={n === page ? "active" : ""} aria-current={n === page ? "page" : undefined}>{n}</Link>)}
        {page < totalPages ? <Link href={href({ page: page + 1 })} aria-label="다음 페이지"><ChevronRight /></Link> : <span aria-hidden><ChevronRight /></span>}
      </nav>}
    </section>
  </main>;
}
