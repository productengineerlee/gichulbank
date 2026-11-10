// Supabase 키(sb_secret_…/sb_publishable_…)로 요청하면 Supabase 게이트웨이가 요청마다 짧은 JWT 를 만들어 DB(PostgREST)에 넘긴다.
// 이때 게이트웨이 시계가 DB 시계보다 조금 앞서면 PostgREST 가 401 PGRST303 "JWT issued at future" 로 거절한다
// (2026-11-10 /admin/attempts 오류 화면의 원인). 인증 단계에서 거절된 요청이라 쿼리는 실행되지 않았으므로,
// 시계 차이가 풀릴 때까지 잠시 기다렸다가 같은 요청을 다시 보낸다.
const CLOCK_SKEW_RETRY_DELAYS_MS = [500, 1000, 2000, 3000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isJwtIssuedInFuture(response: Response) {
  if (response.status !== 401) return false;
  try {
    const body = await response.clone().json() as { code?: string };
    return body.code === "PGRST303";
  } catch {
    return false;
  }
}

export const fetchWithClockSkewRetry: typeof fetch = async (input, init) => {
  let response = await fetch(input, init);
  for (const delay of CLOCK_SKEW_RETRY_DELAYS_MS) {
    if (!(await isJwtIssuedInFuture(response))) return response;
    console.warn(`[supabase] JWT issued at future(PGRST303) — ${delay}ms 뒤 다시 시도`);
    await sleep(delay);
    response = await fetch(input, init);
  }
  return response;
};
