import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { createDiagnosticRuleAction, deleteDiagnosticRuleAction, updateDiagnosticRuleAction } from "@/app/admin/actions";
import { levelLabel } from "@/lib/diagnostic-level";
import { createAdminClient } from "@/lib/supabase/admin";

// 등급 이름은 수험생 결과 화면과 같은 이름(levelLabel)을 쓴다.
const levelNames: Record<string, string> = levelLabel;


export default async function AdminDiagnosticsPage({ searchParams }: { searchParams: Promise<{ scope?: string; tag?: string; saved?: string; error?: string }> }) {
  const query = await searchParams;
  const scope = ["generic", "section", "competency"].includes(query.scope ?? "") ? query.scope! : "section";
  const admin = createAdminClient();
  const [{ data: rules }, { data: sections }, { data: questions }] = await Promise.all([
    admin.from("diagnostic_rules").select("*").order("min_percentage").order("priority", { ascending: false }),
    admin.from("exam_sections").select("code,title").order("sort_order"),
    admin.from("questions").select("competency_tags").eq("is_active", true),
  ]);
  const uniqueSections = [...new Map((sections ?? []).map(section => [section.code, section])).values()];
  const tags = [...new Set((questions ?? []).flatMap(question => question.competency_tags))].sort((a, b) => a.localeCompare(b, "ko"));
  const selectedTag = tags.includes(query.tag ?? "") ? query.tag! : tags[0] ?? "";
  const visibleRules = (rules ?? []).filter(rule => scope === "generic" ? !rule.section_code && !rule.competency_tag : scope === "section" ? Boolean(rule.section_code) : rule.competency_tag === selectedTag);
  const returnTo = scope === "competency" ? `/admin/diagnostics?scope=competency&tag=${encodeURIComponent(selectedTag)}` : `/admin/diagnostics?scope=${scope}`;
  const sectionTitle = new Map(uniqueSections.map(section => [section.code, section.title]));

  return <main className="admin-content">
    <header className="admin-page-head"><div><span>DIAGNOSTIC ENGINE</span><h1>진단 규칙 관리</h1><p>영역·역량별 점수 구간과 개인 보강 코멘트를 관리합니다.</p></div></header>
    {query.saved && <div className="admin-message success">{query.saved}</div>}{query.error && <div className="admin-message error">{query.error}</div>}
    <nav className="diagnostic-tabs"><Link className={scope === "generic" ? "active" : ""} href="/admin/diagnostics?scope=generic">공통 기본</Link><Link className={scope === "section" ? "active" : ""} href="/admin/diagnostics?scope=section">영역별</Link><Link className={scope === "competency" ? "active" : ""} href={`/admin/diagnostics?scope=competency&tag=${encodeURIComponent(selectedTag)}`}>역량별</Link></nav>
    {scope === "competency" && <div className="tag-filter">{tags.map(tag => <Link className={tag === selectedTag ? "active" : ""} href={`/admin/diagnostics?scope=competency&tag=${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}</div>}
    <section className="rules-heading"><div><h2>{scope === "generic" ? "공통 기본 규칙" : scope === "section" ? "영역별 규칙" : `${selectedTag} 역량 규칙`}</h2><p>활성 규칙의 점수 범위는 서로 겹칠 수 없습니다.</p></div><span>{visibleRules.length}개 규칙</span></section>
    <div className="rule-list">{visibleRules.map(rule => <article className={`rule-card level-${rule.level} ${!rule.is_active ? "inactive" : ""}`} key={rule.id}>
      <form action={updateDiagnosticRuleAction} className="rule-edit-form">
        <input type="hidden" name="id" value={rule.id} /><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="sectionCode" value={rule.section_code ?? ""} /><input type="hidden" name="competencyTag" value={rule.competency_tag ?? ""} />
        <div className="rule-card-head"><div><span>{levelNames[rule.level] ?? rule.level}</span><h3>{rule.section_code ? sectionTitle.get(rule.section_code) ?? rule.section_code : rule.competency_tag ?? "모든 영역·역량"}</h3></div><label className="switch-label"><input type="checkbox" name="isActive" defaultChecked={rule.is_active} /><span>활성</span></label></div>
        <div className="form-grid four"><label><span>최소 %</span><input type="number" name="minPercentage" min="0" max="100" step="0.01" defaultValue={rule.min_percentage} /></label><label><span>최대 %</span><input type="number" name="maxPercentage" min="0" max="100" step="0.01" defaultValue={rule.max_percentage} /></label><label><span>수준</span><select name="level" defaultValue={rule.level}><option value="foundation">{levelLabel.foundation}</option><option value="weak">{levelLabel.weak}</option><option value="developing">{levelLabel.developing}</option><option value="strong">{levelLabel.strong}</option></select></label><label><span>우선순위</span><input type="number" name="priority" min="-32768" max="32767" defaultValue={rule.priority} /></label></div>
        <label><span>진단 코멘트</span><textarea name="comment" rows={2} defaultValue={rule.comment} required /></label><label><span>보강 방법</span><textarea name="recommendation" rows={3} defaultValue={rule.recommendation ?? ""} /></label>
        <button className="admin-secondary"><Save />저장</button>
      </form>
      {(rule.section_code || rule.competency_tag) && <form action={deleteDiagnosticRuleAction} className="rule-delete-form"><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="returnTo" value={returnTo} /><button title="규칙 삭제"><Trash2 />삭제</button></form>}
    </article>)}</div>

    <details className="admin-panel new-rule"><summary><Plus />새 규칙 추가</summary><form action={createDiagnosticRuleAction} className="admin-form"><input type="hidden" name="returnTo" value={returnTo} />
      <div className="form-grid two"><label><span>영역</span><select name="sectionCode" defaultValue={scope === "section" ? uniqueSections[0]?.code : ""}><option value="">지정 안 함</option>{uniqueSections.map(section => <option value={section.code} key={section.code}>{section.title}</option>)}</select></label><label><span>역량 태그</span><select name="competencyTag" defaultValue={scope === "competency" ? selectedTag : ""}><option value="">지정 안 함</option>{tags.map(tag => <option value={tag} key={tag}>{tag}</option>)}</select></label></div>
      <div className="form-grid four"><label><span>최소 %</span><input type="number" name="minPercentage" min="0" max="100" step="0.01" defaultValue="0" /></label><label><span>최대 %</span><input type="number" name="maxPercentage" min="0" max="100" step="0.01" defaultValue="100" /></label><label><span>수준</span><select name="level" defaultValue="foundation"><option value="foundation">{levelLabel.foundation}</option><option value="weak">{levelLabel.weak}</option><option value="developing">{levelLabel.developing}</option><option value="strong">{levelLabel.strong}</option></select></label><label><span>우선순위</span><input type="number" name="priority" defaultValue="100" /></label></div>
      <label><span>진단 코멘트</span><textarea name="comment" rows={2} required /></label><label><span>보강 방법</span><textarea name="recommendation" rows={3} /></label><label className="check-row"><input type="checkbox" name="isActive" /><span>추가 즉시 활성화합니다.</span></label><button className="admin-primary"><Plus />규칙 추가</button>
    </form></details>
  </main>;
}
