-- =====================================================================
-- 사이트 문구/연락처 설정 (관리자에서 상단·회사정보 편집용)
-- Supabase SQL Editor 에 붙여넣고 RUN. (한 번만)
-- 이 값들은 공개 사이트에 표시되는 내용이라 공개 읽기 허용입니다.
-- =====================================================================

create table if not exists public.settings (
  key   text primary key,
  value text default ''
);

alter table public.settings enable row level security;

-- 공개 사이트: 누구나 읽기 (상단 문구 표시용)
drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings for select using (true);

-- 관리자(로그인): 쓰기
drop policy if exists "settings auth insert" on public.settings;
create policy "settings auth insert" on public.settings for insert to authenticated with check (true);
drop policy if exists "settings auth update" on public.settings;
create policy "settings auth update" on public.settings for update to authenticated using (true) with check (true);

-- 기본값 채우기 (이미 있으면 유지)
insert into public.settings (key, value) values
  ('hero_eyebrow',  '공동구매 마켓 제안서 · B2B 도매'),
  ('hero_title1',   '바다에서'),
  ('hero_title2',   '식탁까지,'),
  ('hero_title3',   '한 번에 채우다'),
  ('hero_lead',     '전체 약 500여 종 취급 품목 중, 공동구매 마켓에 바로 올리기 좋은 1만 원대 수산물을 중심으로 간편식품·생활용품까지 엄선해 공급가와 택배 조건으로 정리했습니다.'),
  ('company',       '주식회사 마스터'),
  ('team',          '외부유통팀'),
  ('manager_name',  '박원비'),
  ('manager_title', '팀장'),
  ('phone',         '010-2326-5911'),
  ('email',         'feellost@naver.com'),
  ('kakao',         'wonbi123')
on conflict (key) do nothing;
