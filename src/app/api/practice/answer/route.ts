import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gradePracticeAnswer, PracticeError, type PracticeMode } from "@/lib/practice";
import { ROUND_PRACTICE_MODE } from "@/lib/round-practice";

const MODES: PracticeMode[] = ["review", "daily", "random"];
const MAX_TIME_MS = 60 * 60 * 1000;

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as { questionId?: unknown; label?: unknown; timeSpentMs?: unknown; mode?: unknown };
  if (typeof body.questionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.questionId)) return null;
  if (typeof body.label !== "string" || body.label.length === 0 || body.label.length > 10) return null;
  // 회차 연습모드("round")는 DB에 "random" 으로 기록한다.
  const mode = body.mode === "round" ? ROUND_PRACTICE_MODE : MODES.find((item) => item === body.mode) ?? "review";
  // 풀이 시간은 참고용 데이터라 이상값은 버리고(null) 채점은 그대로 진행한다.
  const time = typeof body.timeSpentMs === "number" && Number.isFinite(body.timeSpentMs) && body.timeSpentMs >= 0 ? Math.min(Math.round(body.timeSpentMs), MAX_TIME_MS) : null;
  return { questionId: body.questionId, label: body.label, timeSpentMs: time, mode };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "요청 데이터를 읽을 수 없습니다." }, { status: 400 }); }
  const body = parseBody(raw);
  if (!body) return NextResponse.json({ error: "올바른 답안 데이터가 아닙니다." }, { status: 400 });

  try {
    const feedback = await gradePracticeAnswer(user.id, body.questionId, body.label, body.timeSpentMs, body.mode);
    return NextResponse.json(feedback, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PracticeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[practice-answer]", error);
    return NextResponse.json({ error: "채점 중 오류가 발생했습니다." }, { status: 500 });
  }
}
