import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { createLicenseScheduleAction, deleteLicenseScheduleAction, updateLicenseScheduleAction } from "@/app/admin/actions";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLicenseSchedulesPage({ searchParams }: { searchParams: Promise<{ cert?: string; saved?: string; error?: string }> }) {
  const query = await searchParams;
  const admin = createAdminClient();
  const { data: certifications } = await admin.from("certifications").select("id,code,name").order("sort_order");
  const certs = certifications ?? [];
  const selected = certs.find((cert) => cert.code === query.cert) ?? certs[0];

  const { data: schedules } = selected
    ? await admin.from("certification_schedules").select("*").eq("certification_id", selected.id).order("sort_order")
    : { data: [] };

  const returnTo = selected ? `/admin/license-schedules?cert=${selected.code}` : "/admin/license-schedules";

  return <main className="admin-content">
    <header className="admin-page-head"><div><span>CERTIFICATION</span><h1>자격증 시험 일정 관리</h1><p>자격증 상세 페이지에 노출되는 회차별 시험 일정을 관리합니다.</p></div></header>
    {query.saved && <div className="admin-message success">{query.saved}</div>}{query.error && <div className="admin-message error">{query.error}</div>}

    {certs.length > 1 && <nav className="diagnostic-tabs">{certs.map((cert) => <Link className={cert.code === selected?.code ? "active" : ""} href={`/admin/license-schedules?cert=${cert.code}`} key={cert.code}>{cert.name}</Link>)}</nav>}

    {!selected ? (
      <p>등록된 자격증이 없습니다. 먼저 시딩 스크립트로 자격증을 생성해 주세요.</p>
    ) : (
      <>
        <section className="rules-heading"><div><h2>{selected.name} 일정</h2><p>회차명·시험일·접수기간을 관리합니다.</p></div><span>{(schedules ?? []).length}건</span></section>
        <div className="rule-list">{(schedules ?? []).map((schedule) => (
          <article className="rule-card" key={schedule.id}>
            <form action={updateLicenseScheduleAction} className="rule-edit-form">
              <input type="hidden" name="id" value={schedule.id} />
              <input type="hidden" name="certificationId" value={selected.id} />
              <input type="hidden" name="certificationCode" value={selected.code} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="form-grid two">
                <label><span>회차명</span><input type="text" name="roundName" defaultValue={schedule.round_name} required /></label>
                <label><span>정렬 순서</span><input type="number" name="sortOrder" defaultValue={schedule.sort_order} /></label>
              </div>
              <div className="form-grid two">
                <label><span>시험일</span><input type="date" name="examDate" defaultValue={schedule.exam_date ?? ""} /></label>
                <label><span>시험시간</span><input type="text" name="notes" defaultValue={schedule.notes ?? ""} placeholder="오전 10시" /></label>
              </div>
              <div className="form-grid two">
                <label><span>접수 시작</span><input type="date" name="applyStart" defaultValue={schedule.apply_start ?? ""} /></label>
                <label><span>접수 종료</span><input type="date" name="applyEnd" defaultValue={schedule.apply_end ?? ""} /></label>
              </div>
              <label><span>비고 (관리자 메모, 사용자 화면에는 보이지 않음)</span><textarea name="memo" rows={2} defaultValue={schedule.memo ?? ""} /></label>
              <button className="admin-secondary"><Save />저장</button>
            </form>
            <form action={deleteLicenseScheduleAction} className="rule-delete-form">
              <input type="hidden" name="id" value={schedule.id} />
              <input type="hidden" name="certificationCode" value={selected.code} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button title="일정 삭제"><Trash2 />삭제</button>
            </form>
          </article>
        ))}</div>

        <details className="admin-panel new-rule"><summary><Plus />새 일정 추가</summary>
          <form action={createLicenseScheduleAction} className="admin-form">
            <input type="hidden" name="certificationId" value={selected.id} />
            <input type="hidden" name="certificationCode" value={selected.code} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="form-grid two">
              <label><span>회차명</span><input type="text" name="roundName" placeholder="2026년 제3회" required /></label>
              <label><span>정렬 순서</span><input type="number" name="sortOrder" defaultValue="0" /></label>
            </div>
            <div className="form-grid two">
              <label><span>시험일</span><input type="date" name="examDate" /></label>
              <label><span>시험시간</span><input type="text" name="notes" placeholder="오전 10시" /></label>
            </div>
            <div className="form-grid two">
              <label><span>접수 시작</span><input type="date" name="applyStart" /></label>
              <label><span>접수 종료</span><input type="date" name="applyEnd" /></label>
            </div>
            <label><span>비고 (관리자 메모, 사용자 화면에는 보이지 않음)</span><textarea name="memo" rows={2} /></label>
            <button className="admin-primary"><Plus />일정 추가</button>
          </form>
        </details>
      </>
    )}
  </main>;
}
