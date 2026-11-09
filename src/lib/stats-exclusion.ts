import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/supabase/paging";

// 관리자 계정은 화면을 시험해 보느라 응시를 자주 만든다. 이 응시가 정답률·응시자 수·이용 현황에
// 섞이지 않도록 통계에서는 관리자(profiles.role = 'admin')의 응시를 뺀다.

/** 관리자 계정 id 목록. */
export async function listAdminUserIds(): Promise<string[]> {
  const admin = createAdminClient();
  const rows = await fetchAll<{ id: string }>((from, to) => admin.from("profiles").select("id").eq("role", "admin").order("id").range(from, to), "관리자 목록을 불러오지 못했습니다.");
  return rows.map((row) => row.id);
}

/** 관리자 계정이 만든 응시 id 목록. */
export async function listAdminAttemptIds(adminIds?: string[]): Promise<string[]> {
  const ids = adminIds ?? await listAdminUserIds();
  if (!ids.length) return [];
  const admin = createAdminClient();
  const rows = await fetchByIds(ids, (chunk, from, to) => admin.from("attempts").select("id").in("user_id", chunk).order("id").range(from, to), "관리자 응시 기록을 불러오지 못했습니다.");
  return rows.map((row) => row.id);
}

/** PostgREST `not in` 필터 값. 예: (id1,id2) */
export const inList = (ids: string[]) => `(${ids.join(",")})`;
