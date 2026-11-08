import type { ReactNode } from "react";
import { formatPrompt } from "@/lib/format-prompt";

// 지문 마크업
//   ```  … ```          코드 블록(고정폭·들여쓰기 유지)
//   :::box … :::        시험지의 네모 박스 제시문(<보기>, ㄱ·ㄴ·ㄷ 나열, 사례 등)
//   | a | b |           마크다운 표(구분선 |---| 줄 포함)
const BLOCK_PATTERN = /```[a-zA-Z]*\n?([\s\S]*?)```|:::box\n?([\s\S]*?)\n?:::/g;

/** 문항 지문 표시. 코드 블록·박스 제시문·표를 나눠 그리고, 나머지 글은 formatPrompt 로 정리해 보여 준다. */
export function PromptText({ prompt, className }: { prompt: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of prompt.matchAll(BLOCK_PATTERN)) {
    pushText(nodes, prompt.slice(last, match.index), `t${last}`);
    if (match[1] !== undefined) {
      nodes.push(<pre key={`c${match.index}`} className="prompt-code"><code>{match[1].replace(/\n$/, "")}</code></pre>);
    } else {
      const inner: ReactNode[] = [];
      pushText(inner, match[2], "b");
      nodes.push(<div key={`b${match.index}`} className="prompt-box">{inner}</div>);
    }
    last = match.index + match[0].length;
  }
  pushText(nodes, prompt.slice(last), `t${last}`);
  return <div className={className}>{nodes}</div>;
}

/** 글 조각을 표와 일반 글로 나눠 담는다. */
function pushText(nodes: ReactNode[], text: string, key: string) {
  const lines = text.trim().split("\n");
  let buffer: string[] = [];
  let table: string[] = [];
  const flushText = () => {
    const body = buffer.join("\n").trim();
    if (body) nodes.push(<span key={`${key}-${nodes.length}`} className="prompt-paragraph">{formatPrompt(body)}</span>);
    buffer = [];
  };
  const flushTable = () => {
    if (table.length) nodes.push(<PromptTable key={`${key}-${nodes.length}`} rows={table} />);
    table = [];
  };
  for (const line of lines) {
    if (line.trim().startsWith("|")) { flushText(); table.push(line); }
    else { flushTable(); buffer.push(line); }
  }
  flushText();
  flushTable();
}

function PromptTable({ rows }: { rows: string[] }) {
  const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
  const body = rows.filter(row => !/^\s*\|[\s:|-]+\|\s*$/.test(row)).map(cells);
  const [head, ...rest] = body;
  return (
    <div className="prompt-table-wrap">
      <table className="prompt-table">
        {head && <thead><tr>{head.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>}
        <tbody>{rest.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

