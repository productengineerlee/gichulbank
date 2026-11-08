/** 기출 지문의 o/ㅇ/○/- 글머리표를 줄바꿈으로 정리한다. 응시 화면·오답노트에서 함께 쓴다. */
export function formatPrompt(prompt: string) {
  // 같은 줄 안에서 이어진 글머리표만 나눈다. 이미 줄 맨 앞에 있는 글머리표(박스 제시문 등)는 그대로 둔다.
  const bulletPattern = /(\S)[ \t]+([oOㅇ○])[ \t]+/g;
  if (bulletPattern.test(prompt)) {
    let isFirstItem = true;
    return prompt.replace(bulletPattern, (_, prev: string) => {
      const separator = isFirstItem ? "\n\n" : "\n";
      isFirstItem = false;
      return `${prev}${separator}ㅇ `;
    });
  }
  // AICE 샘플처럼 한 줄짜리 지문에서 문장 끝(". -" / ") -") 뒤에 "-" 를 글머리표로 쓴 경우만 줄바꿈한다.
  // "귀속적 욕구 - 아동수당" 같은 연결 표기나 여러 줄 지문은 그대로 둔다.
  if (prompt.includes("\n") || !/[.)]\s+-\s*\S/.test(prompt)) return prompt;
  let isFirstDash = true;
  return prompt.replace(/(\S)\s+-\s*(?=\S)/g, (_, prev: string) => {
    const separator = isFirstDash ? "\n\n" : "\n";
    isFirstDash = false;
    return `${prev}${separator}ㅇ `;
  });
}

/** 목록·미리보기용 한 줄 지문: 코드 블록(```)·박스(:::box) 마크업 기호를 걷어 낸다. */
export function promptPreview(prompt: string) {
  return prompt.replace(/```[a-zA-Z]*\n?/g, "").replace(/:::box\n?|\n?:::/g, " ").replace(/\s+/g, " ").trim();
}

/** 해설 데이터는 "정답 ④" 줄로 시작한다(검수용). 화면에는 정답이 따로 보이므로 그 줄은 빼고 보여준다. */
export function formatExplanation(explanation: string | null | undefined) {
  const text = explanation?.trim();
  if (!text) return null;
  return text.replace(/^정답\s*[①②③④⑤]\s*\n+/, "").trim() || null;
}

export const AI_EXPLANATION_NOTE = "AI가 작성한 해설입니다. 틀린 내용이 보이면 QnA로 알려 주세요.";
