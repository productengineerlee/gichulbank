-- 회차 후기(별점 1~5 + 한 줄 평). 회차를 채점까지 마친 회원만 쓸 수 있고, 회원·회차마다 하나만 남긴다(다시 쓰면 수정).
-- 읽기·쓰기는 모두 서버(service role)에서만 한다. 관리자는 is_hidden 으로 공개에서 내릴 수 있다.
create table if not exists public.exam_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  certification_id uuid not null references public.certifications on delete cascade,
  exam_id uuid not null references public.exams on delete cascade,
  attempt_id uuid references public.attempts on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 300),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exam_id)
);
create index if not exists exam_reviews_certification_idx on public.exam_reviews (certification_id, created_at desc);

alter table public.exam_reviews enable row level security;
-- 정책을 두지 않아 브라우저(anon/authenticated)에서는 직접 읽거나 쓸 수 없다.
