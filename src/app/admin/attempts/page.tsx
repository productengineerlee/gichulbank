import Link from "next/link";
import { ClipboardList, UserPlus, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttemptStatus } from "@/types/database";

const AICE_LABEL = "AICE";
const KST = "Asia/Seoul";
const kstDay = (value: string | Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: KST }).format(new Date(value));
const kstDateTime = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: KST }) : "-";
const providerLabel: Record<string, string> = { email: "이메일", google: "Google", kakao: "카카오", naver: "네이버" };

const statusLabel: Record<AttemptStatus, string> = {
  in_progress: "진행중",
  expired: "시간종료",
  submitted: "제출완료",
  graded: "채점완료",
};

async function loadAttempts() {
  const admin = createAdminClient();
  const [{ data: attempts, error: attemptError }, { data: exams, error: examError }, { data: certifications, error: certError }] = await Promise.all([
    admin.from("attempts").select("id,user_id,exam_id,status,total_score,started_at").order("started_at", { ascending: false }),
    admin.from("exams").select("id,title,certification_id"),
    admin.from("certifications").select("id,name"),
  ]);
  if (attemptError || examError || certError || !attempts || !exams || !certifications) throw new Error("응시 현황을 불러오지 못했습니다.");

  const users: { id: string; email: string | null; createdAt: string; lastSignInAt: string | null; provider: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("회원 정보를 불러오지 못했습니다.");
    users.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      provider: String(user.app_metadata?.provider ?? "email"),
    })));
    if (data.users.length < 1000) break;
  }

  const examById = new Map(exams.map((exam) => [exam.id, exam]));
  const certNameById = new Map(certifications.map((cert) => [cert.id, cert.name]));
  const emailByUserId = new Map(users.map((user) => [user.id, user.email]));

  const attemptCountByUserId = new Map<string, number>();
  for (const attempt of attempts) attemptCountByUserId.set(attempt.user_id, (attemptCountByUserId.get(attempt.user_id) ?? 0) + 1);
  const members = users
    .map((user) => ({ ...user, attemptCount: attemptCountByUserId.get(user.id) ?? 0 }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rows = attempts.map((attempt) => {
    const exam = examById.get(attempt.exam_id);
    const certName = exam?.certification_id ? (certNameById.get(exam.certification_id) ?? "알 수 없음") : AICE_LABEL;
    return {
      id: attempt.id,
      email: emailByUserId.get(attempt.user_id) ?? "탈퇴한 회원",
      examTitle: exam?.title ?? "삭제된 시험",
      certName,
      status: attempt.status,
      totalScore: attempt.total_score,
      startedAt: attempt.started_at,
    };
  });
  return { rows, members, now: Date.now() };
}

export default async function AdminAttemptsPage({ searchParams }: { searchParams: Promise<{ cert?: string; status?: string; view?: string }> }) {
  const query = await searchParams;
  const { rows, members, now } = await loadAttempts();
  if (query.view === "members") return <MembersView members={members} now={now} />;

  const certNames = [...new Set(rows.map((row) => row.certName))].sort((a, b) => a.localeCompare(b, "ko"));
  const filtered = rows.filter((row) => (!query.cert || row.certName === query.cert) && (!query.status || row.status === query.status));

  const buildHref = (next: { cert?: string; status?: string }) => {
    const params = new URLSearchParams();
    const cert = next.cert !== undefined ? next.cert : query.cert;
    const status = next.status !== undefined ? next.status : query.status;
    if (cert) params.set("cert", cert);
    if (status) params.set("status", status);
    if (query.view) params.set("view", query.view);
    const search = params.toString();
    return `/admin/attempts${search ? `?${search}` : ""}`;
  };

  const stats = {
    total: filtered.length,
    inProgress: filtered.filter((row) => row.status === "in_progress").length,
    graded: filtered.filter((row) => row.status === "graded" || row.status === "submitted").length,
    expired: filtered.filter((row) => row.status === "expired").length,
  };

  return <main className="admin-content">
    <header className="admin-page-head compact">
      <div><span>MEMBER ACTIVITY</span><h1>전체 응시 현황</h1><p>회원이 응시한 AICE·자격증 시험 기록을 한 곳에서 확인합니다.</p></div>
    </header>
    <ViewTabs active="attempts" />

    <section className="admin-stats">
      <article><ClipboardList /><div><span>전체 응시</span><strong>{stats.total}</strong></div></article>
      <article><ClipboardList /><div><span>진행중</span><strong>{stats.inProgress}</strong></div></article>
      <article><ClipboardList /><div><span>채점·제출 완료</span><strong>{stats.graded}</strong></div></article>
      <article><ClipboardList /><div><span>시간종료</span><strong>{stats.expired}</strong></div></article>
    </section>

    <section className="admin-panel">
      <div className="tag-filter">
        <Link className={!query.cert ? "active" : ""} href={buildHref({ cert: undefined })}>전체</Link>
        {certNames.map((name) => <Link key={name} className={query.cert === name ? "active" : ""} href={buildHref({ cert: name })}>{name}</Link>)}
      </div>
      <div className="tag-filter">
        <Link className={!query.status ? "active" : ""} href={buildHref({ status: undefined })}>전체 상태</Link>
        {(Object.keys(statusLabel) as AttemptStatus[]).map((status) => <Link key={status} className={query.status === status ? "active" : ""} href={buildHref({ status })}>{statusLabel[status]}</Link>)}
      </div>

      <div className="admin-panel-head"><div><span>ATTEMPTS</span><h2>응시 목록</h2></div><small>{filtered.length}건</small></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>자격증</th><th>시험명</th><th>이메일</th><th>상태</th><th>점수</th><th>시작일시</th></tr></thead>
        <tbody>{filtered.map((row) => <tr key={row.id}>
          <td>{row.certName}</td>
          <td>{row.examTitle}</td>
          <td>{row.email}</td>
          <td><b className={`admin-status status-${row.status}`}>{statusLabel[row.status]}</b></td>
          <td>{row.totalScore !== null ? `${row.totalScore}점` : "-"}</td>
          <td>{kstDateTime(row.startedAt)}</td>
        </tr>)}</tbody>
      </table></div> : <p>조건에 맞는 응시 기록이 없습니다.</p>}
    </section>
  </main>;
}

function ViewTabs({ active }: { active: "attempts" | "members" }) {
  return <nav className="diagnostic-tabs">
    <Link className={active === "attempts" ? "active" : ""} href="/admin/attempts">응시 현황</Link>
    <Link className={active === "members" ? "active" : ""} href="/admin/attempts?view=members">회원가입 현황</Link>
  </nav>;
}

type Member = { id: string; email: string | null; createdAt: string; lastSignInAt: string | null; provider: string; attemptCount: number };

function MembersView({ members, now }: { members: Member[]; now: number }) {
  const daysAgo = (days: number) => kstDay(new Date(now - days * 86_400_000));
  const today = daysAgo(0);
  const countSince = (since: string) => members.filter((member) => kstDay(member.createdAt) >= since).length;
  const stats = {
    total: members.length,
    today: countSince(today),
    week: countSince(daysAgo(6)),
    month: countSince(daysAgo(29)),
  };
  // 최근 14일 일별 가입 수 (오늘부터 거꾸로)
  const daily = Array.from({ length: 14 }, (_, index) => {
    const day = daysAgo(index);
    return { day, count: members.filter((member) => kstDay(member.createdAt) === day).length };
  });
  const maxDaily = Math.max(1, ...daily.map((item) => item.count));
  const tested = members.filter((member) => member.attemptCount > 0).length;

  return <main className="admin-content">
    <header className="admin-page-head compact">
      <div><span>MEMBER ACTIVITY</span><h1>회원가입 현황</h1><p>가입 회원 수와 가입 추이, 회원별 응시 여부를 확인합니다. 날짜는 한국 시간 기준입니다.</p></div>
    </header>
    <ViewTabs active="members" />

    <section className="admin-stats">
      <article><Users /><div><span>전체 회원</span><strong>{stats.total}</strong></div></article>
      <article><UserPlus /><div><span>오늘 가입</span><strong>{stats.today}</strong></div></article>
      <article><UserPlus /><div><span>최근 7일 가입</span><strong>{stats.week}</strong></div></article>
      <article><UserPlus /><div><span>최근 30일 가입</span><strong>{stats.month}</strong></div></article>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><span>DAILY SIGNUPS</span><h2>최근 14일 일별 가입</h2></div><small>응시 1회 이상 회원 {tested}명 / {stats.total}명</small></div>
      <div className="signup-daily">{daily.map((item) => <div key={item.day}>
        <span>{item.day.slice(5).replace("-", ".")}</span>
        <i><b style={{ width: `${(item.count / maxDaily) * 100}%` }} /></i>
        <strong>{item.count}</strong>
      </div>)}</div>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><span>MEMBERS</span><h2>회원 목록</h2></div><small>최근 가입순 {members.length}명</small></div>
      {members.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>가입일시</th><th>이메일</th><th>가입 방식</th><th>마지막 로그인</th><th>응시 수</th></tr></thead>
        <tbody>{members.map((member) => <tr key={member.id}>
          <td>{kstDateTime(member.createdAt)}</td>
          <td>{member.email ?? "-"}</td>
          <td>{providerLabel[member.provider] ?? member.provider}</td>
          <td>{kstDateTime(member.lastSignInAt)}</td>
          <td>{member.attemptCount ? `${member.attemptCount}회` : "-"}</td>
        </tr>)}</tbody>
      </table></div> : <p>가입한 회원이 없습니다.</p>}
    </section>
  </main>;
}
