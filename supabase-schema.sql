-- =====================================================
--  FORTALEZA FITNESS — ESQUEMA SUPABASE
--  Ejecuta este SQL en: Supabase > SQL Editor
-- =====================================================

-- TABLA: MIEMBROS
create table if not exists members (
  id           text primary key,
  name         text not null,
  cedula       text not null unique,
  phone        text,
  email        text,
  plan         text not null,
  start_date   date not null,
  expiry_date  date not null,
  notes        text,
  last_checkin timestamptz,
  created_at   timestamptz default now()
);

-- TABLA: PAGOS
create table if not exists payments (
  id           text primary key,
  member_id    text references members(id) on delete cascade,
  member_name  text not null,
  plan         text not null,
  amount       integer not null,
  pay_date     date not null,
  expiry_date  date not null,
  method       text not null,
  status       text not null default 'pagado',
  created_at   timestamptz default now()
);

-- TABLA: CHECK-INS
create table if not exists checkins (
  id           text primary key,
  member_id    text references members(id) on delete cascade,
  member_name  text not null,
  plan         text not null,
  timestamp    timestamptz not null,
  overdue      boolean default false,
  created_at   timestamptz default now()
);

-- ÍNDICES para consultas frecuentes
create index if not exists idx_payments_member  on payments(member_id);
create index if not exists idx_checkins_member  on checkins(member_id);
create index if not exists idx_checkins_ts      on checkins(timestamp);
create index if not exists idx_members_expiry   on members(expiry_date);

-- =====================================================
--  ROW LEVEL SECURITY (RLS)
--  Activa RLS y permite acceso con la anon key
--  IMPORTANTE: Esto es suficiente para un MVP.
--  En producción, considera autenticación real.
-- =====================================================

alter table members  enable row level security;
alter table payments enable row level security;
alter table checkins enable row level security;

-- Políticas: la anon key puede leer y escribir todo
-- (MVP — para producción restringe según roles)
create policy "anon full access members"
  on members for all using (true) with check (true);

create policy "anon full access payments"
  on payments for all using (true) with check (true);

create policy "anon full access checkins"
  on checkins for all using (true) with check (true);
