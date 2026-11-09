const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

/** 보기 번호 표기("1" 또는 "①")를 숫자 문자열("1")로 맞춘다. */
export function choiceKey(label: string) {
  const index = CIRCLED.indexOf(label.trim());
  return index >= 0 ? String(index + 1) : label.trim();
}

/** 숫자 보기 번호를 원문자로 바꾼다. 원문자로 못 바꾸면 그대로 둔다. */
export function circled(label: string) {
  const key = choiceKey(label);
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : label;
}

export type ParsedExplanation = {
  /** 해설 첫머리의 정답 표기에서 읽은 정답 보기(숫자 문자열) */
  answerKey: string | null;
  /** 보기별 설명 앞의 총평 문단 */
  summary: string[];
  /** 보기 번호(숫자 문자열) → 그 보기에 대한 설명 */
  byChoice: Map<string, string>;
};

/**
 * 해설 데이터 형식: "정답 ④" 줄 → 총평 → "① …" 처럼 보기 번호로 시작하는 줄.
 * "②③④ …" 처럼 여러 보기를 한 줄에 묶은 설명은 해당 보기 모두에 붙인다.
 * 보기 번호 줄이 하나도 없으면 byChoice 는 비어 있고 전체가 총평이 된다.
 */
export function parseExplanation(text: string | null | undefined): ParsedExplanation | null {
  const body = text?.trim();
  if (!body) return null;
  const lines = body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let answerKey: string | null = null;
  const head = lines[0]?.match(/^정답\s*([①-⑩])\s*$/);
  if (head) {
    answerKey = choiceKey(head[1]);
    lines.shift();
  }

  const summary: string[] = [];
  const byChoice = new Map<string, string>();
  let lastKeys: string[] = [];
  for (const line of lines) {
    const match = line.match(/^([①-⑩](?:\s*[,·]?\s*[①-⑩])*)\s*(.*)$/);
    if (match) {
      lastKeys = [...match[1].replace(/[\s,·]/g, "")].map(choiceKey);
      for (const key of lastKeys) byChoice.set(key, byChoice.has(key) ? `${byChoice.get(key)} ${match[2]}` : match[2]);
    } else if (lastKeys.length) {
      // 보기 설명이 다음 줄로 이어지는 경우
      for (const key of lastKeys) byChoice.set(key, `${byChoice.get(key) ?? ""} ${line}`.trim());
    } else {
      summary.push(line);
    }
  }
  return { answerKey, summary, byChoice };
}

/** 역량 태그에서 문항 주제를 뽑는다. "과목-주제" 형식이면 주제만 쓴다. */
export function topicOf(tags: string[]) {
  const tag = tags[0]?.trim();
  if (!tag) return null;
  const dash = tag.indexOf("-");
  return dash > 0 ? tag.slice(dash + 1).trim() : tag;
}
