-- =====================================================================
-- FitLog · Tablas y seguridad de la base de datos
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar → Run.
-- Se puede volver a ejecutar sin romper nada (no borra datos).
-- =====================================================================

-- 1) DÍAS: una fila por usuario y por día (comidas, entrenos y peso de ese día)
create table if not exists public.days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists days_user_updated_idx on public.days (user_id, updated_at);

-- 2) AJUSTES: una fila por usuario (perfil, alimentos y ejercicios propios)
create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3) Fecha de última modificación automática (la pone el servidor, no el teléfono)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists days_touch on public.days;
create trigger days_touch before insert or update on public.days
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before insert or update on public.settings
  for each row execute function public.touch_updated_at();

-- 4) SEGURIDAD POR FILA (RLS): cada usuario solo ve y cambia SUS filas
alter table public.days enable row level security;
alter table public.settings enable row level security;

drop policy if exists "days_own" on public.days;
create policy "days_own" on public.days
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "settings_own" on public.settings;
create policy "settings_own" on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 5) PERMISOS DE LA API: solo usuarios con sesión iniciada; los anónimos no ven nada
revoke all on public.days, public.settings from anon;
grant select, insert, update, delete on public.days, public.settings to authenticated;
