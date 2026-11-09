-- memo(비고)는 관리자 메모가 아니라 자격증 상세 일정표에 보여 주는 안내 문구다.
-- 202611100012 에서 막았던 공개 조회를 되돌린다.
comment on column public.certification_schedules.memo is '비고. 자격증 상세 페이지 일정표에 노출';
grant select on public.certification_schedules to anon, authenticated;
