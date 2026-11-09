"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, Bookmark, ChevronLeft, ChevronRight, ClipboardList, Clock3, FileQuestion, Files, Save, Send, SquareStack, X } from "lucide-react";
import type { PublicExam } from "@/lib/exams";
import { PromptText } from "@/components/prompt-text";
import { examSource } from "@/lib/exam-source";
import { OmrSheet } from "@/components/exams/omr-sheet";

type Stored = {
  attemptId?: string;
  answers: Record<string, string>;
  flagged: number[];
  current: number;
  deadline: number;
  updatedAt: number;
  status?: "submitted";
};
type RemoteAttempt = {
  attemptId: string;
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
  answers: Record<string, string>;
  flagged: number[];
};
type SaveState = "preparing" | "saving" | "saved" | "local";
type Layout = "sheet" | "single";

const LAYOUT_KEY = "exam-layout";
const WIDE_QUERY = "(min-width: 1024px)";
// 문제지+OMR 두 칸 화면은 넓은 화면에서만 쓴다. 좁은 화면은 한 문제씩 보기 + 아래에서 올라오는 OMR.
function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}


export function ExamRunner({ exam }: { exam: PublicExam }) {
  const key = `exam-attempt:${exam.slug}:v1`;
  // 예전 저장 키(이름만 바뀜)에 남은 임시 답안도 이어서 읽는다.
  const legacyKey = `aice-attempt:${exam.slug}:v1`;
  const [ready, setReady] = useState(false);
  const [startError, setStartError] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(exam.durationMinutes * 60);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("preparing");
  const [navOpen, setNavOpen] = useState(false);
  const [layoutPref, setLayoutPref] = useState<Layout>("sheet");
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const sheetMode = wide && layoutPref === "sheet";
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submissionLock = useRef(false);
  const autoSubmitStarted = useRef(false);
  const question = exam.questions[current];
  const answered = Object.values(answers).filter((value) => value.trim()).length;
  const source = examSource(exam.slug);
  const sectionTitleByCode = useMemo(() => new Map(exam.sections.map((section) => [section.code, section.title])), [exam.sections]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      let local: Stored | null = null;
      try {
        const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
        if (raw) local = JSON.parse(raw) as Stored;
        if (localStorage.getItem(LAYOUT_KEY) === "single") setLayoutPref("single");
      } catch { /* Ignore a damaged local fallback. */ }

      try {
        const response = await fetch(`/api/exams/${exam.slug}/attempt`, { method: "POST" });
        if (response.status === 401) {
          window.location.href = "/auth/login";
          return;
        }
        const remote = await response.json() as RemoteAttempt & { error?: string };
        if (!response.ok) throw new Error(remote.error ?? "응시 정보를 불러오지 못했습니다.");
        if (cancelled) return;

        const mergeLocal = Boolean(local && local.status !== "submitted" && (!local.attemptId || local.attemptId === remote.attemptId));
        const mergedAnswers = mergeLocal ? { ...remote.answers, ...local?.answers } : remote.answers;
        const mergedFlagged = mergeLocal ? [...new Set([...remote.flagged, ...(local?.flagged ?? [])])] : remote.flagged;
        setAttemptId(remote.attemptId);
        setAnswers(mergedAnswers);
        setFlagged(mergedFlagged);
        setCurrent(mergeLocal ? Math.min(local?.current ?? 0, exam.questions.length - 1) : 0);
        setDeadline(new Date(remote.expiresAt).getTime());
        setSavedAt(new Date(remote.updatedAt));
        setSaveState("saved");
        setReady(true);
      } catch (error) {
        if (!cancelled) setStartError(error instanceof Error ? error.message : "응시를 시작하지 못했습니다.");
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, [exam.questions.length, exam.slug, key, legacyKey]);

  useEffect(() => {
    if (!ready || !deadline) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) setShowSubmit(true);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [ready, deadline]);

  useEffect(() => {
    if (!ready || !deadline || !attemptId) return;
    const localTimer = setTimeout(() => {
      const value: Stored = { attemptId, answers, flagged, current, deadline, updatedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(value));
      setSavedAt(new Date());
      setSaveState("local");
    }, 250);
    const serverTimer = setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch(`/api/exams/${exam.slug}/attempt/${attemptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, flagged }),
        });
        const saved = await response.json() as { savedAt?: string; error?: string };
        if (!response.ok) throw new Error(saved.error ?? "서버 저장에 실패했습니다.");
        setSavedAt(new Date(saved.savedAt ?? Date.now()));
        setSaveState("saved");
      } catch {
        setSaveState("local");
      }
    }, 900);
    return () => {
      clearTimeout(localTimer);
      clearTimeout(serverTimer);
    };
}, [answers, attemptId, current, deadline, exam.slug, flagged, key, ready]);

  useEffect(() => {
    if (!ready || !attemptId || saveState !== "local" || Date.now() >= deadline) return;
    async function retry() {
      if (Date.now() >= deadline) return;
      try {
        const response = await fetch(`/api/exams/${exam.slug}/attempt/${attemptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, flagged }),
        });
        const saved = await response.json() as { savedAt?: string };
        if (!response.ok) return;
        setSavedAt(new Date(saved.savedAt ?? Date.now()));
        setSaveState("saved");
      } catch { /* Stay on the local fallback until the network recovers. */ }
    }
    const timer = setInterval(retry, 5_000);
    window.addEventListener("online", retry);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); };
  }, [answers, attemptId, deadline, exam.slug, flagged, ready, saveState]);

  const progress = useMemo(() => Math.round(answered / exam.questionCount * 100), [answered, exam.questionCount]);

  const locked = remaining === 0 || submitting;
  function answerFor(number: number, value: string) {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [String(number)]: value }));
  }
  function toggleFlagFor(number: number) {
    setFlagged((currentFlags) => currentFlags.includes(number)
      ? currentFlags.filter((item) => item !== number)
      : [...currentFlags, number]);
  }
  function toggleFlag() {
    toggleFlagFor(question.number);
  }
  function move(index: number) {
    const next = Math.max(0, Math.min(index, exam.questions.length - 1));
    setCurrent(next);
    setNavOpen(false);
    if (sheetMode) {
      document.getElementById(`sheet-q${exam.questions[next].number}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function changeLayout(next: Layout) {
    setLayoutPref(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* 저장 못 해도 이번 화면에는 적용된다. */ }
    window.scrollTo({ top: 0 });
  }
  function resetAnswers() {
    if (locked || !answered) return;
    if (window.confirm("입력한 답안을 모두 지울까요? 검토 표시는 그대로 둡니다.")) setAnswers({});
  }
const finish = useCallback(async () => {
    if (!attemptId || submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    setSubmitError("");
    let timeout = 0;
    try {
      const controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 30_000);
      const response = await fetch(`/api/exams/${exam.slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers, flagged }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const result = await response.json() as { error?: string; requestId?: string; [key: string]: unknown };
      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }
      if (!response.ok) throw new Error(`${result.error ?? "채점에 실패했습니다."}${result.requestId ? ` (오류 ID: ${result.requestId})` : ""}`);
      localStorage.setItem(`exam-result:${exam.slug}:latest`, JSON.stringify(result));
      const stored: Stored = { attemptId, answers, flagged, current, deadline, updatedAt: Date.now(), status: "submitted" };
      localStorage.setItem(key, JSON.stringify(stored));
      window.location.href = `/exams/${exam.slug}/result?attemptId=${attemptId}`;
    } catch (error) {
      if (timeout) window.clearTimeout(timeout);
      setSubmitError(error instanceof DOMException && error.name === "AbortError" ? "서버 응답이 지연되고 있습니다. 네트워크를 확인한 뒤 다시 제출해 주세요." : error instanceof Error ? error.message : "채점 중 오류가 발생했습니다.");
      setSubmitting(false);
      submissionLock.current = false;
    }
  }, [answers, attemptId, current, deadline, exam.slug, flagged, key]);

  useEffect(() => {
    if (!ready || !attemptId || remaining !== 0 || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    setShowSubmit(true);
    void finish();
  }, [attemptId, finish, ready, remaining]);

  if (startError) return <div className="runner-loading"><AlertTriangle/><p>{startError}</p><button onClick={() => window.location.reload()}>다시 시도</button><Link href="/license">기출문제 목록으로 돌아가기</Link></div>;
  if (!ready) return <div className="runner-loading">시험지를 불러오는 중이에요. 잠시만 기다려 주세요.</div>;

  const saveCopy = saveState === "saving"
    ? "서버에 저장 중"
    : saveState === "saved"
      ? `${savedAt?.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) ?? ""} 서버 저장됨`
      : saveState === "local"
        ? "로컬 저장됨 · 서버 재시도"
        : "저장 준비 중";

  const renderChoices = (item: typeof question) => item.choices.length > 0
    ? item.choices.map((choice) => <label className={`choice ${answers[String(item.number)] === choice.id ? "selected" : ""}`} key={choice.id}>
      <input type="radio" name={`q-${item.number}`} value={choice.id} checked={answers[String(item.number)] === choice.id} disabled={locked} onChange={() => { answerFor(item.number, choice.id); setCurrent(exam.questions.indexOf(item)); }}/>
      <span className="choice-label">{choice.label}</span><span>{choice.content}</span>
    </label>)
    : <label className="text-answer"><span>답안 입력</span><input inputMode={item.type === "text" ? "text" : "decimal"} value={answers[String(item.number)] ?? ""} disabled={locked} onChange={(event) => answerFor(item.number, event.target.value)} placeholder={item.type === "unit_value" ? "예: 12.9k" : "정답을 입력하세요"}/><small>문제에서 안내한 반올림 및 단위 형식을 지켜 입력하세요.</small></label>;

  const omr = <OmrSheet questions={exam.questions} answers={answers} flagged={flagged} current={sheetMode ? undefined : current} disabled={locked} onPick={answerFor} onJump={move} />;
  const autosave = <div className="autosave"><Save/><div><b>자동 저장</b><span>{saveCopy}</span></div></div>;

  return <main className={`runner ${sheetMode ? "sheet-mode" : ""}`}>
    <header className="runner-header">
      <div className="runner-brand"><Link href="/" aria-label="랜딩 페이지"><Image src="/mascot.png" alt="기출뱅크" width={28} height={28} className="brand-mark"/><b>기출뱅크</b></Link><span>{exam.title}</span></div>
      <div className="runner-header-actions">
        {wide && <button type="button" className="layout-toggle" onClick={() => changeLayout(sheetMode ? "single" : "sheet")}>{sheetMode ? <><SquareStack/>한 문제씩 보기</> : <><Files/>문제지로 보기</>}</button>}
        <Link className="sample-link" href="/license"><FileQuestion/><span>기출문제</span></Link>
        <div className={`timer ${remaining < 300 ? "danger" : ""}`}><Clock3/><span>남은 시간</span><b>{formatTime(remaining)}</b></div>
      </div>
    </header>
    <div className="runner-progress"><i style={{ width: `${progress}%` }}></i></div>

    {sheetMode ? <div className="sheet-layout">
      <section className="sheet-paper">
        {exam.questions.map((item) => <article className="sheet-question" id={`sheet-q${item.number}`} key={item.number}>
          <div className="question-top">
            <div><b className="sheet-number">{item.number}.</b><span className="section-label">{sectionTitleByCode.get(item.section) ?? item.section}</span><span className="score-label">{item.score}점</span></div>
            <button className={flagged.includes(item.number) ? "active" : ""} onClick={() => toggleFlagFor(item.number)}><Bookmark/>검토 표시</button>
          </div>
          <PromptText className="question-prompt" prompt={item.prompt}/>
          {item.imageUrl && <img className="question-image" src={item.imageUrl} alt={`문제 ${item.number} 참고 이미지`}/>}
          <div className="answer-area">{renderChoices(item)}</div>
        </article>)}
        {source && <p className="exam-source-note">{source.text}</p>}
      </section>
      <aside className="omr-panel">
        <div className="omr-head"><h2>답안 입력 (1–{exam.questionCount})</h2><p>왼쪽 문제지를 보며 답을 선택하세요.</p></div>
        <div className="omr-scroll">{omr}</div>
        <div className="omr-foot">
          <p>{answered} / {exam.questionCount} 답안 입력 ({progress}%)</p>
          <button type="button" className="omr-submit" onClick={() => setShowSubmit(true)} disabled={locked}>답안 제출</button>
          <button type="button" className="omr-reset" onClick={resetAnswers} disabled={locked || !answered}>초기화</button>
          {autosave}
        </div>
      </aside>
    </div> : <div className="runner-layout">
      {navOpen && <button type="button" className="omr-backdrop" aria-label="답안지 닫기" onClick={() => setNavOpen(false)} />}
      <aside className={navOpen ? "open" : ""}>
        <div className="aside-head"><div><span>OMR 답안지</span><b>{answered} / {exam.questionCount}</b></div><button onClick={() => setNavOpen(false)} aria-label="답안지 닫기"><X/></button></div>
        <div className="omr-scroll">{omr}</div>
        <div className="legend"><span><i className="flag"></i>검토 표시</span><span>번호를 누르면 그 문제로 이동</span></div>
        {autosave}
      </aside>
      <section className="question-area">
        <div className="question-top"><div><span className="section-label">{sectionTitleByCode.get(question.section) ?? question.section}</span><span className="score-label">{question.score}점</span></div><button className={flagged.includes(question.number) ? "active" : ""} onClick={toggleFlag}><Bookmark/>검토 표시</button></div>
        <div className="question-number">문제 {question.number}<small> / {exam.questionCount}</small></div>
        <PromptText className="question-prompt" prompt={question.prompt}/>
        {question.imageUrl && <img className="question-image" src={question.imageUrl} alt={`문제 ${question.number} 참고 이미지`}/>}
        <div className="answer-area">{renderChoices(question)}</div>
        <div className="question-actions"><button disabled={current === 0} onClick={() => move(current - 1)}><ChevronLeft/>이전 문제</button>{current < exam.questions.length - 1 ? <button className="next" onClick={() => move(current + 1)}>다음 문제<ChevronRight/></button> : <button className="submit" onClick={() => setShowSubmit(true)}>답안 제출<Send/></button>}</div>
        {source && <p className="exam-source-note">{source.text}</p>}
      </section>
      <button type="button" className="omr-fab" onClick={() => setNavOpen(true)}><ClipboardList/>OMR 답안지 <b>{answered}/{exam.questionCount}</b></button>
    </div>}

    {showSubmit && <div className="modal-backdrop"><div className="submit-modal"><AlertTriangle/><h2>{remaining === 0 ? "시험 시간이 종료되었습니다" : "답안을 제출할까요?"}</h2><p>총 {exam.questionCount}문항 중 <b>{answered}문항</b>에 답했습니다. 미응답 {exam.questionCount - answered}문항이 있습니다.</p>{submitError && <p className="submit-error">{submitError}</p>}<div><button onClick={() => setShowSubmit(false)} disabled={remaining === 0 || submitting}>계속 풀기</button><button className="confirm" onClick={() => void finish()} disabled={submitting}>{submitting ? "채점·저장 중..." : submitError ? "다시 제출" : "최종 제출"}</button></div></div></div>}
  </main>;
}
