import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { kstDateTime, listAllUsers } from "@/lib/admin-users";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttemptStatus } from "@/types/database";

const statusLabel: Record<AttemptStatus, string> = {
  in_progress: "진행중",
  expired: "시간종료",
  submitted: "제출완료",
  graded: "채점완료",
};

async function loadAttempts() {
  const admin = createAdminClient();
  // Supabase 는 한 번에 최대 1,000행만 돌려주므로 응시 기록은 나눠 읽는다
  const loadAllAttempts = async () => {
    const rows: { id: string; user_id: string; exam_id: string; status: AttemptStatus; total_score: number | null; started_at: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("attempts").select("id,user_id,exam_id,status,total_score,started_at")
        .order("started_at", { ascending: false }).order("id", { ascending: false }).range(from, from + 999);
      if (error || !data) throw new Error("응시 현황을 불러오지 못했습니다.");
      rows.push(...data);
      if (data.length < 1000) return rows;
    }
  };
  const [attempts, { data: exams, error: examError }, { data: certifications, error: certError }] = await Promise.all([
    loadAllAttempts(),
    admin.from("exams").select("id,title,certification_id"),
    admin.from("certifications").select("id,name"),
  ]);
  if (examError || certError || !exams || !certifications) throw new Error("응시 현황을 불러오지 못했습니다.");

  const users = await listAllUsers(admin);

  const examById = new Map(exams.map((exam) => [exam.id, exam]));
  const certNameById = new Map(certifications.map((cert) => [cert.id, cert.name]));
  const emailByUserId = new Map(users.map((user) => [user.id, user.email]));

  return attempts.map((attempt) => {
    const exam = examById.get(attempt.exam_id);
    const certName = exam?.certification_id ? (certNameById.get(exam.certification_id) ?? "알 수 없음") : "알 수 없음";
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
}

export default async function AdminAttemptsPage({ searchParams }: { searchParams: Promise<{ cert?: string; status?: string }> }) {
  const query = await searchParams;
  const rows = await loadAttempts();

  const certNames = [...new Set(rows.map((row) => row.certName))].sort((a, b) => a.localeCompare(b, "ko"));
  const filtered = rows.filter((row) => (!query.cert || row.certName === query.cert) && (!query.status || row.status === query.status));

  const buildHref = (next: { cert?: string; status?: string }) => {
    const params = new URLSearchParams();
    const cert = next.cert !== undefined ? next.cert : query.cert;
    const status = next.status !== undefined ? next.status : query.status;
    if (cert) params.set("cert", cert);
    if (status) params.set("status", status);
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
      <div><span>MEMBER ACTIVITY</span><h1>전체 응시 현황</h1><p>회원이 응시한 자격증 시험 기록을 한 곳에서 확인합니다.</p></div>
    </header>

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

