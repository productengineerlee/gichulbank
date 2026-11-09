import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenCheck, CheckCircle2, ClipboardList } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { inList, listAdminUserIds } from "@/lib/stats-exclusion";

export default async function AdminPage() {
  const admin = createAdminClient();
  const adminIds = await listAdminUserIds();
  const attemptQuery = admin.from("attempts").select("id", { count: "exact", head: true });
  const [{ count: examCount }, { count: questionCount }, { count: ruleCount }, { count: attemptCount }, { data: exams }] = await Promise.all([
    admin.from("exams").select("id", { count: "exact", head: true }),
    admin.from("questions").select("id", { count: "exact", head: true }),
    admin.from("diagnostic_rules").select("id", { count: "exact", head: true }),
    adminIds.length ? attemptQuery.not("user_id", "in", inList(adminIds)) : attemptQuery,
    admin.from("exams").select("id,slug,title,status,total_score,passing_score,duration_minutes,updated_at").order("created_at"),
  ]);
  return <main className="admin-content">
    <header className="admin-page-head"><div><span>ADMIN CONSOLE</span><h1>운영 현황</h1><p>시험 콘텐츠와 진단 기준을 안전하게 관리합니다.</p></div><Link className="admin-primary" href="/admin/exams">시험 관리 <ArrowRight /></Link></header>
    <section className="admin-stats">
      <article><BookOpenCheck /><div><span>등록 시험</span><strong>{examCount ?? 0}</strong></div></article>
      <article><ClipboardList /><div><span>전체 문항</span><strong>{questionCount ?? 0}</strong></div></article>
      <article><BarChart3 /><div><span>진단 규칙</span><strong>{ruleCount ?? 0}</strong></div></article>
      <article><CheckCircle2 /><div><span>누적 응시(관리자 제외)</span><strong>{attemptCount ?? 0}</strong></div></article>
    </section>
    <section className="admin-panel"><div className="admin-panel-head"><div><span>EXAMS</span><h2>시험 운영 상태</h2></div><Link href="/admin/diagnostics">진단 규칙 관리</Link></div><div className="admin-exam-list">{(exams ?? []).map(exam => <article key={exam.id}><div><span className={`admin-status status-${exam.status}`}>{exam.status}</span><h3>{exam.title}</h3><p>{exam.duration_minutes}분 · 합격 {exam.passing_score}/{exam.total_score}점</p></div><Link href={`/admin/exams/${exam.id}`}>관리 <ArrowRight /></Link></article>)}</div></section>
  </main>;
}
