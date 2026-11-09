import { CheckCircle2 } from "lucide-react";
import { AI_EXPLANATION_NOTE } from "@/lib/format-prompt";
import { choiceKey, circled, parseExplanation } from "@/lib/explanation";

type Choice = { label: string; content: string };

interface ExplanationViewProps {
  text: string | null | undefined;
  /** 정답 보기 번호("1" 또는 "①"). 없으면 해설 첫 줄의 "정답 ④"를 쓴다. */
  correctLabel?: string | null;
  /** 넘기면 보기 내용과 설명을 한 카드에 함께 보여 준다(해설 페이지용). */
  choices?: Choice[];
  /** 위에 "해설" 제목을 붙일지 */
  heading?: boolean;
  /** 응시자가 고른 보기(오답 표시용) */
  selectedLabel?: string | null;
}

/** 해설을 총평 + 보기별 카드로 보여 준다. 정답 보기는 초록색으로 강조한다. */
export function ExplanationView({ text, correctLabel, choices, heading = true, selectedLabel }: ExplanationViewProps) {
  const parsed = parseExplanation(text);
  if (!parsed) return <div className="explanation-view">{heading && <b className="explanation-heading">해설</b>}<p className="explanation-empty">해설을 준비 중입니다.</p></div>;

  const correct = correctLabel ? choiceKey(correctLabel) : parsed.answerKey;
  const selected = selectedLabel ? choiceKey(selectedLabel) : null;
  // 보기 목록이 있으면 그 순서대로, 없으면 해설에 나온 보기를 번호순으로 보여 준다.
  const rows: { key: string; label: string; content?: string; note?: string }[] = choices?.length
    ? choices.map((choice) => ({ key: choiceKey(choice.label), label: choice.label, content: choice.content, note: parsed.byChoice.get(choiceKey(choice.label)) }))
    : [...parsed.byChoice.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([key, note]) => ({ key, label: key, note }));

  return <div className="explanation-view">
    {heading && <b className="explanation-heading">해설</b>}
    {parsed.summary.map((line, index) => <p className="explanation-summary" key={index}>{line}</p>)}
    {rows.length > 0 && <ol className="explanation-choices">
      {rows.map((row) => {
        const isCorrect = row.key === correct;
        const isWrongPick = !isCorrect && row.key === selected;
        return <li key={row.key} className={isCorrect ? "correct" : isWrongPick ? "picked" : ""}>
          <span className="explanation-choice-num">{circled(row.label)}</span>
          <div>
            {row.content && <p className="explanation-choice-content">{row.content}</p>}
            {row.note && <p className="explanation-choice-note">{row.note}</p>}
          </div>
          {isCorrect && <CheckCircle2 aria-label="정답" />}
        </li>;
      })}
    </ol>}
    <small className="explanation-note">{AI_EXPLANATION_NOTE}</small>
  </div>;
}
