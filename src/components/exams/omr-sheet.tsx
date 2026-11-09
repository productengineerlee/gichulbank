"use client";

import { Bookmark } from "lucide-react";
import type { PublicQuestion } from "@/lib/exams";
import { circled } from "@/lib/explanation";

interface OmrSheetProps {
  questions: PublicQuestion[];
  answers: Record<string, string>;
  flagged: number[];
  /** 지금 보고 있는 문항 위치(한 문제씩 보기에서 강조) */
  current?: number;
  disabled?: boolean;
  onPick: (questionNumber: number, value: string) => void;
  onJump: (index: number) => void;
}

/** 실제 시험 답안지처럼 문항 번호 옆에 보기 번호를 칠하는 OMR 목록. */
export function OmrSheet({ questions, answers, flagged, current, disabled, onPick, onJump }: OmrSheetProps) {
  return <ol className="omr-rows">
    {questions.map((question, index) => {
      const value = answers[String(question.number)];
      return <li key={question.number} className={index === current ? "current" : ""}>
        <button type="button" className="omr-num" onClick={() => onJump(index)} aria-label={`${question.number}번 문제로 이동`}>
          {question.number}.{flagged.includes(question.number) && <Bookmark aria-label="검토 표시" />}
        </button>
        {question.choices.length > 0
          ? <div className="omr-bubbles" role="radiogroup" aria-label={`${question.number}번 답안`}>
            {question.choices.map((choice) => <button
              type="button"
              role="radio"
              aria-checked={value === choice.id}
              key={choice.id}
              className={value === choice.id ? "marked" : ""}
              disabled={disabled}
              onClick={() => onPick(question.number, choice.id)}
            >{circled(choice.label)}</button>)}
          </div>
          : <button type="button" className="omr-text" onClick={() => onJump(index)}>{value ? `입력: ${value}` : "주관식 입력"}</button>}
      </li>;
    })}
  </ol>;
}
