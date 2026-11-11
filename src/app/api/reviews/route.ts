import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getMyReview, REVIEW_COMMENT_MAX, REVIEWS_TAG, ReviewError, saveMyReview } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const noStore = { "Cache-Control": "no-store" };

async function currentUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function failure(error: unknown) {
  if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  console.error("[reviews-api]", error);
  return NextResponse.json({ error: "후기 처리 중 오류가 발생했습니다." }, { status: 500, headers: noStore });
}

/** 내 후기 조회: ?attemptId= */
export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: noStore });
  const attemptId = new URL(request.url).searchParams.get("attemptId") ?? "";
  if (!UUID.test(attemptId)) return NextResponse.json({ error: "올바른 응시 정보가 아닙니다." }, { status: 400, headers: noStore });
  try { return NextResponse.json({ review: await getMyReview(userId, attemptId) }, { headers: noStore }); }
  catch (error) { return failure(error); }
}

/** 후기 저장(같은 회차는 덮어쓰기): { attemptId, rating 1~5, comment? } */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: noStore });
  let body: { attemptId?: unknown; rating?: unknown; comment?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "요청 데이터를 읽을 수 없습니다." }, { status: 400, headers: noStore }); }
  const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  const rating = typeof body.rating === "number" ? body.rating : NaN;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!UUID.test(attemptId) || !Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: "별점을 1~5개로 골라 주세요." }, { status: 400, headers: noStore });
  if (comment.length > REVIEW_COMMENT_MAX) return NextResponse.json({ error: `한 줄 평은 ${REVIEW_COMMENT_MAX}자까지 쓸 수 있어요.` }, { status: 400, headers: noStore });
  try {
    const review = await saveMyReview(userId, attemptId, rating, comment || null);
    revalidateTag(REVIEWS_TAG, "max");
    return NextResponse.json({ review }, { headers: noStore });
  } catch (error) { return failure(error); }
}
