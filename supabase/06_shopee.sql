-- ==========================================================================
--  RAZENLAB · 06 · aba Shopee do painel
--  Rode no Supabase → SQL Editor (uma vez). Pode rodar de novo sem problema.
--
--  Guarda os itens que você prepara para vender na Shopee: custo, preço,
--  anúncio, fotos, checklist e vendas. Só você (admin) lê e grava.
-- ==========================================================================

create table if not exists public.shopee_itens (
  id uuid primary key default gen_random_uuid(),
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists shopee_itens_tocar on public.shopee_itens;
create trigger shopee_itens_tocar before update on public.shopee_itens
  for each row execute function public.tocar();

alter table public.shopee_itens enable row level security;
drop policy if exists "admin tudo" on public.shopee_itens;
create policy "admin tudo" on public.shopee_itens for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.shopee_itens from anon;
