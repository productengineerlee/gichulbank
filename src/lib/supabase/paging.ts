// PostgREST는 요청 하나에 최대 1,000행만 돌려준다. 회원 데이터가 쌓여도 결과가 잘리지 않도록
// 여러 번 나눠 읽는 공통 헬퍼. 쿼리는 반드시 정렬(order)이 있어야 페이지가 겹치거나 빠지지 않는다.

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

const PAGE = 1000;
const ID_CHUNK = 150; // .in() 에 넣는 id 개수 (URL 길이 제한 대비)

const RETRY_DELAYS_MS = [300, 1000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const describe = (error: unknown) => error instanceof Error ? error.message : typeof error === "object" && error ? JSON.stringify(error) : String(error);

/**
 * Supabase 조회를 잠깐 실패(네트워크 끊김·일시적 5xx)해도 두 번까지 다시 시도한다.
 * 끝내 실패하면 원래 오류 내용을 서버 로그에 남기고 errorMessage 로 던진다(운영 화면에는 메시지가 가려진다).
 */
export async function withRetry<T>(label: string, run: () => PromiseLike<{ data: T; error: unknown }>, errorMessage = "데이터를 불러오지 못했습니다."): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { data, error } = await run();
      if (!error) return data;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  console.error(`[supabase] ${label} 실패:`, describe(lastError));
  throw new Error(errorMessage);
}

/** range(from, to)를 받아 쿼리를 만드는 함수를 넘기면 끝까지 읽어서 합쳐 준다. */
export async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>, errorMessage = "데이터를 불러오지 못했습니다."): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const data = await withRetry(`range ${from}`, () => page(from, from + PAGE - 1), errorMessage);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** id 목록을 나눠 .in() 조회하고, 조각마다 1,000행을 넘으면 이어서 읽는다. */
export async function fetchByIds<T>(ids: string[], page: (chunk: string[], from: number, to: number) => PageResult<T>, errorMessage?: string): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    rows.push(...await fetchAll((from, to) => page(chunk, from, to), errorMessage));
  }
  return rows;
}
