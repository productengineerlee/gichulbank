import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

export type AdminUser = { id: string; email: string | null; createdAt: string; lastSignInAt: string | null; provider: string };

/** Supabase Auth 회원 전체를 1,000명씩 끊어 읽는다. 관리자 화면 전용. */
export async function listAllUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: AdminUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("회원 정보를 불러오지 못했습니다.");
    users.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      provider: String(user.app_metadata?.provider ?? "email"),
    })));
    if (data.users.length < 1000) break;
  }
  return users;
}

const KST = "Asia/Seoul";
/** 한국 시간 기준 날짜(YYYY-MM-DD) */
export const kstDay = (value: string | number | Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: KST }).format(new Date(value));
/** 한국 시간 기준 일시 표시 */
export const kstDateTime = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: KST }) : "-";
