-- ════════════════════════════════════════════════════════════════
--  미션 보드 — Supabase 초기 설정
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 RUN 하세요.
--  ★ 아래 34번째 줄의 이메일 두 개를 본인과 배우자 이메일로 바꾸세요.
-- ════════════════════════════════════════════════════════════════

-- ── 1. 허용된 사용자 목록 ─────────────────────────────────────────
-- 여기 등록된 이메일만 데이터를 읽고 쓸 수 있습니다.
-- 다른 사람이 회원가입을 해도 이 표에 없으면 아무것도 못 봅니다.
create table if not exists public.allowed_users (
  email text primary key,
  note  text,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

-- 로그인한 사람이 "내가 허용 목록에 있는지"만 확인할 수 있게 허용
drop policy if exists "read own allowlist row" on public.allowed_users;
create policy "read own allowlist row"
  on public.allowed_users for select
  to authenticated
  using (email = auth.jwt() ->> 'email');


-- ── 2. 주간 체크 데이터 ───────────────────────────────────────────
-- 한 주(월요일 날짜)에 한 행. 두 아이 데이터가 JSON으로 함께 들어갑니다.
create table if not exists public.mission_weeks (
  week_start date primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.mission_weeks enable row level security;

-- 허용 목록에 있는 사람인지 확인하는 함수
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where email = auth.jwt() ->> 'email'
  );
$$;

drop policy if exists "allowed can read"   on public.mission_weeks;
drop policy if exists "allowed can insert" on public.mission_weeks;
drop policy if exists "allowed can update" on public.mission_weeks;

create policy "allowed can read"
  on public.mission_weeks for select
  to authenticated using (public.is_allowed());

create policy "allowed can insert"
  on public.mission_weeks for insert
  to authenticated with check (public.is_allowed());

create policy "allowed can update"
  on public.mission_weeks for update
  to authenticated using (public.is_allowed()) with check (public.is_allowed());


-- ── 3. 실시간 동기화 켜기 ─────────────────────────────────────────
-- 한쪽 폰에서 체크하면 다른 폰 화면에 바로 반영됩니다.
alter table public.mission_weeks replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.mission_weeks;
exception
  when duplicate_object then null;
end $$;


-- ── 4. ★ 여기를 본인 이메일로 바꾸세요 ★ ─────────────────────────
insert into public.allowed_users (email, note) values
  ('geuntae_kim@icloud.com', '아빠'),
  ('lotusgem@naver.com', '엄마')
on conflict (email) do nothing;


-- ── 확인 ─────────────────────────────────────────────────────────
select * from public.allowed_users;
