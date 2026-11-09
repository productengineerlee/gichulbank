// Client-safe: no "server-only" import here, unlike diagnostics.ts. Shared by both server code
// (diagnostics.ts re-exports these) and client components (result-view.tsx, mypage) that need the
// same level -> Korean label mapping without pulling in diagnostics.ts's Supabase/server deps.
export type DiagnosticLevel = "foundation" | "weak" | "developing" | "strong";
export const levelLabel: Record<DiagnosticLevel, string> = { foundation: "기초 부족", weak: "보강 필요", developing: "합격권", strong: "안정권" };
