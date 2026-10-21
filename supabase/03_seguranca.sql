-- ==========================================================================
--  RAZENLAB · segurança do painel
--  Rode UMA vez no Supabase (SQL Editor → New query → cole tudo → RUN).
--  Pode rodar de novo sem problema: nada é apagado.
--
--  O que este arquivo faz:
--  1) Verificação em duas etapas obrigatória: quando você ativa o código do
--     app autenticador no painel, o banco passa a EXIGIR esse código. Quem
--     tiver só a sua senha não consegue ver nem mudar nada.
--  2) Confere a senha atual antes de trocar por uma nova.
--  3) Guarda o histórico de acessos e mudanças de segurança da sua conta.
-- ==========================================================================

-- 1. ADMINISTRADOR = está na lista E passou pelo código, se tiver ativado
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (
         select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
       )
     );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. CONFERIR A SENHA ATUAL (sem trocar a sessão)
create or replace function public.conferir_senha(p_senha text) returns boolean
language plpgsql security definer set search_path = public, auth, extensions as $$
declare ok boolean;
begin
  if auth.uid() is null or not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Sem permissão.';
  end if;
  select u.encrypted_password = extensions.crypt(p_senha, u.encrypted_password)
    into ok from auth.users u where u.id = auth.uid();
  if not coalesce(ok, false) then
    perform pg_sleep(1);   -- atrasa quem tenta adivinhar
  end if;
  return coalesce(ok, false);
end;
$$;
revoke all on function public.conferir_senha(text) from public, anon;
grant execute on function public.conferir_senha(text) to authenticated;

-- 3. HISTÓRICO DE ACESSOS
create table if not exists public.acessos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  evento text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
create index if not exists acessos_user_data on public.acessos (user_id, criado_em desc);
alter table public.acessos enable row level security;

drop policy if exists "admin le acessos" on public.acessos;
create policy "admin le acessos" on public.acessos for select to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.admins where user_id = auth.uid()));
grant select on public.acessos to authenticated;

create or replace function public.registrar_acesso(p_evento text, p_aparelho text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins where user_id = auth.uid()) then
    return;
  end if;
  if p_evento not in ('entrou','saiu','saiu_todos','senha_trocada','senha_redefinida','2fa_ativada','2fa_removida','inatividade') then
    raise exception 'Evento inválido.';
  end if;
  insert into public.acessos (user_id, evento, aparelho) values (auth.uid(), p_evento, left(p_aparelho, 120));
  -- guarda só os 200 mais recentes
  delete from public.acessos where user_id = auth.uid() and id not in (
    select id from public.acessos where user_id = auth.uid() order by criado_em desc limit 200);
end;
$$;
revoke all on function public.registrar_acesso(text, text) from public, anon;
grant execute on function public.registrar_acesso(text, text) to authenticated;

-- 4. CONFERÊNCIA: deve mostrar o seu e-mail e se a verificação em duas etapas está ativa
select u.email as "administrador",
       exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as "duas etapas ativa"
from public.admins a join auth.users u on u.id = a.user_id;
