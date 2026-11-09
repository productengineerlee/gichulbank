import Link from "next/link";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { updateQuestionAction } from "@/app/admin/actions";
import { PromptText } from "@/components/prompt-text";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const message = await searchParams;
  const admin = createAdminClient();
  const { data: question } = await admin.from("questions").select("*").eq("id", id).maybeSingle();
  if (!question) notFound();
  const [{ data: exam }, { data: sections }, { data: choices }, { data: answerKey }] = await Promise.all([
    admin.from("exams").select("id,title,slug").eq("id", question.exam_id).single(),
    admin.from("exam_sections").select("id,title,code").eq("exam_id", question.exam_id).order("sort_order"),
    admin.from("question_choices").select("*").eq("question_id", question.id).order("sort_order"),
    admin.from("answer_keys").select("*").eq("question_id", question.id).maybeSingle(),
  ]);
  if (!exam || !answerKey) notFound();
  const isChoice = question.type === "single_choice";
  return <main className="admin-content">
    <Link className="admin-back" href={`/admin/exams/${exam.id}`}><ArrowLeft />{exam.title}</Link>
    <header className="admin-page-head compact"><div><span>QUESTION EDITOR</span><h1>문제 {question.number}</h1><p>{question.type} · 정답과 해설은 관리자에게만 표시됩니다.</p></div></header>
    {message.saved && <div className="admin-message success">{message.saved}</div>}{message.error && <div className="admin-message error">{message.error}</div>}
    <form className="question-editor" action={updateQuestionAction}>
      <input type="hidden" name="id" value={question.id} /><input type="hidden" name="returnTo" value={`/admin/questions/${question.id}`} />
      <section className="admin-panel admin-form"><div className="admin-panel-head"><div><span>QUESTION</span><h2>문항 정보</h2></div><button className="admin-primary"><Save />전체 저장</button></div>
        <div className="question-preview"><span>사용자 화면 미리보기</span>
          <PromptText className="question-preview-prompt" prompt={question.prompt} />
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 원본 이미지를 그대로 보여준다 */}
          {question.image_url && <img src={question.image_url} alt={`문제 ${question.number} 자료`} />}
          {question.image_url && <a href={question.image_url} target="_blank" rel="noreferrer">자료 이미지 원본 열기</a>}
          <small>저장한 내용 기준이에요. 문제를 고친 뒤에는 저장해야 미리보기에 반영돼요.</small>
        </div>
        <label><span>문제</span><textarea name="prompt" defaultValue={question.prompt} rows={8} required /></label>
        <label><span>실행 안내</span><textarea name="instructions" defaultValue={question.instructions ?? ""} rows={3} /></label>
        <div className="form-grid three"><label><span>영역</span><select name="sectionId" defaultValue={question.section_id}>{(sections ?? []).map(section => <option value={section.id} key={section.id}>{section.title}</option>)}</select></label><label><span>배점</span><input type="number" name="score" min="0.01" step="0.01" defaultValue={question.score} /></label><label><span>난이도</span><input type="number" name="difficulty" min="1" max="5" defaultValue={question.difficulty} /></label></div>
        <div className="form-grid two"><label><span>역량 태그</span><input name="competencyTags" defaultValue={question.competency_tags.join(", ")} placeholder="쉼표로 구분" /></label><label><span>답안 형식 안내</span><input name="answerFormatHint" defaultValue={question.answer_format_hint ?? ""} /></label></div>
        <label className="check-row"><input type="checkbox" name="isActive" defaultChecked={question.is_active} /><span>시험에 이 문항을 사용합니다.</span></label>
      </section>

      {isChoice && <section className="admin-panel admin-form"><div className="admin-panel-head"><div><span>CHOICES</span><h2>보기와 정답</h2></div><small>정답 보기를 선택하세요.</small></div><div className="choice-editor">{(choices ?? []).map(choice => <label key={choice.id}><input type="radio" name="correctChoiceId" value={choice.id} defaultChecked={answerKey.correct_choice_id === choice.id} /><b>{choice.label}</b><input name={`choice_${choice.id}`} defaultValue={choice.content} required /></label>)}</div></section>}

      <section className="admin-panel admin-form protected-answer"><div className="admin-panel-head"><div><span>ANSWER KEY</span><h2><ShieldCheck />정답·채점·해설</h2></div><small>서버 및 관리자 전용</small></div>
        <div className="form-grid two"><label><span>채점 방식</span><select name="gradingType" defaultValue={answerKey.grading_type}><option value="exact">정확히 일치</option><option value="rounded">반올림</option><option value="absolute_tolerance">절대 허용오차</option><option value="relative_tolerance">상대 허용오차</option><option value="multiple_answers">복수 정답</option></select></label>{!isChoice && <label><span>정답 값</span><input name="correctValue" defaultValue={answerKey.correct_value ?? ""} /></label>}</div>
        <label><span>허용 정답값</span><textarea name="acceptedValues" defaultValue={answerKey.accepted_values.join("\n")} rows={3} placeholder="줄바꿈 또는 쉼표로 구분" /></label>
        <div className="form-grid two"><label><span>소수 자릿수</span><input type="number" min="0" max="10" name="decimalPlaces" defaultValue={answerKey.decimal_places ?? ""} /></label><label><span>허용 오차</span><input type="number" min="0" step="any" name="tolerance" defaultValue={answerKey.tolerance ?? ""} /></label></div>
        <label className="check-row"><input type="checkbox" name="caseSensitive" defaultChecked={answerKey.case_sensitive} /><span>영문 대소문자를 구분합니다.</span></label>
        <label><span>해설</span><textarea name="explanation" defaultValue={answerKey.explanation ?? ""} rows={6} /></label>
        <div className="form-footer"><button className="admin-primary"><Save />문항과 정답 저장</button></div>
      </section>
    </form>
  </main>;
}
