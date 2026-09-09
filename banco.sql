-- =====================================================================
-- Controle de Outorga e Irrigação — SAKUMA Agronegócios
-- Estrutura do banco (Supabase / PostgreSQL)
-- Cole no SQL Editor do projeto e execute uma vez.
-- =====================================================================

create table if not exists public.out_locais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  tipo       text not null default 'Fazenda',
  cabecalho  text,
  ordem      int  not null default 0,
  criado_em  timestamptz not null default now()
);

create table if not exists public.out_controles (
  id         uuid primary key default gen_random_uuid(),
  local_id   uuid not null references public.out_locais(id) on delete cascade,
  nav_label  text not null,
  header     text not null,
  titulo     text not null,
  colunas    jsonb not null default '[]'::jsonb,
  ordem      int  not null default 0,
  criado_em  timestamptz not null default now()
);

create table if not exists public.out_produtores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  ordem      int  not null default 0,
  criado_em  timestamptz not null default now()
);

create index if not exists out_controles_local_idx on public.out_controles(local_id);

-- ---------------------------------------------------------------------
-- Acesso público de leitura e escrita (o app é aberto por link,
-- e o conteúdo são fichas em branco para impressão).
-- ---------------------------------------------------------------------
alter table public.out_locais     enable row level security;
alter table public.out_controles  enable row level security;
alter table public.out_produtores enable row level security;

do $$
declare t text;
begin
  foreach t in array array['out_locais','out_controles','out_produtores'] loop
    execute format('drop policy if exists %I on public.%I', t || '_acesso_livre', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_acesso_livre', t
    );
  end loop;
end $$;
