import Link from "next/link";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { updateExamAction } from "@/app/admin/actions";
import { promptPreview } from "@/lib/format-prompt";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminExamDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const message = await searchParams;
  const admin = createAdminClient();
  const [{ data: exam }, { data: sections }, { data: questions }] = await Promise.all([
    admin.from("exams").select("*").eq("id", id).maybeSingle(),
    admin.from("exam_sections").select("*").eq("exam_id", id).order("sort_order"),
    admin.from("questions").select("id,section_id,number,type,prompt,score,difficulty,competency_tags,is_active").eq("exam_id", id).order("number"),
  ]);
  if (!exam) notFound();
  const sectionById = new Map((sections ?? []).map(section => [section.id, section]));
  return <main className="admin-content">
    <Link className="admin-back" href="/admin/exams"><ArrowLeft />시험 목록</Link>
    <header className="admin-page-head compact"><div><span>EXAM SETTINGS</span><h1>{exam.title}</h1><p>{exam.slug}</p></div>{exam.status === "published" && <Link className="admin-secondary" href={`/exams/${exam.slug}/explanation`} target="_blank">해설 페이지 <ArrowRight /></Link>}</header>
    {message.saved && <div className="admin-message success">{message.saved}</div>}{message.error && <div className="admin-message error">{message.error}</div>}
    <form className="admin-panel admin-form" action={updateExamAction}>
      <input type="hidden" name="id" value={exam.id} /><input type="hidden" name="returnTo" value={`/admin/exams/${exam.id}`} />
      <div className="admin-panel-head"><div><span>GENERAL</span><h2>시험 기본 설정</h2></div><button className="admin-primary"><Save />설정 저장</button></div>
      <div className="form-grid two"><label><span>시험명</span><input name="title" defaultValue={exam.title} required /></label><label><span>공개 상태</span><select name="status" defaultValue={exam.status}><option value="draft">초안</option><option value="published">공개</option><option value="archived">보관</option></select></label></div>
      <label><span>시험 설명</span><textarea name="description" defaultValue={exam.description ?? ""} rows={3} /></label>
      <div className="form-grid three"><label><span>시험 시간(분)</span><input type="number" name="durationMinutes" min="1" max="600" defaultValue={exam.duration_minutes} required /></label><label><span>합격 점수</span><input type="number" name="passingScore" min="0" max={exam.total_score} step="0.01" defaultValue={exam.passing_score} required /></label><label><span>현재 총점</span><input value={`${exam.total_score}점`} disabled /></label></div>
      <label className="check-row"><input type="checkbox" name="fixedOrder" defaultChecked={exam.fixed_order} /><span>문항 순서를 고정합니다.</span></label>
    </form>
    <section className="admin-panel question-management"><div className="admin-panel-head"><div><span>QUESTIONS</span><h2>문항 목록</h2></div><small>활성 {(questions ?? []).filter(question => question.is_active).length} / 전체 {(questions ?? []).length}</small></div><div className="admin-question-list">{(questions ?? []).map(question => { const section = sectionById.get(question.section_id); return <article key={question.id} className={!question.is_active ? "inactive" : ""}><div className="question-number">{question.number}</div><div className="question-summary"><div><span>{section?.title ?? "영역 없음"}</span><small>{question.type} · 난이도 {question.difficulty} · {question.score}점</small>{!question.is_active && <b>비활성</b>}</div><h3>{promptPreview(question.prompt)}</h3><p>{question.competency_tags.join(" · ") || "역량 태그 없음"}</p></div><Link href={`/admin/questions/${question.id}`}>수정 <ArrowRight /></Link></article>; })}</div></section>
  </main>;
}
