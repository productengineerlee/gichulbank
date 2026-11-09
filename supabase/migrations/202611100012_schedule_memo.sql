-- 시험 일정의 notes 칸은 이제 "시험시간"(예: 오전 10시)으로 쓴다.
-- 관리자만 보는 메모(비고)를 따로 둘 수 있게 memo 칸을 추가한다.
alter table public.certification_schedules add column if not exists memo text;

comment on column public.certification_schedules.notes is '시험시간 (예: 오전 10시). 자격증 상세 페이지에 노출';
comment on column public.certification_schedules.memo is '관리자 메모(비고). 사용자 화면에 노출하지 않음';

-- 일정 표는 로그인 없이도 읽을 수 있으므로, 메모 칸은 공개 조회 대상에서 뺀다(관리자 화면은 service role 로 읽는다).
revoke select on public.certification_schedules from anon, authenticated;
grant select (id, certification_id, round_name, exam_date, apply_start, apply_end, notes, sort_order, created_at)
  on public.certification_schedules to anon, authenticated;
