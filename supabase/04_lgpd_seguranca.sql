-- ==========================================================================
--  RAZENLAB · reforço de segurança e LGPD
--  Rode UMA vez no Supabase (SQL Editor → New query → cole tudo → RUN),
--  depois do 01, 02 e 03. Pode rodar de novo: nada é apagado.
--
--  O que este arquivo faz:
--  1) Fecha as tabelas para visitantes (defesa em camadas, além do RLS).
--  2) Pedido de orçamento: limite contra robôs, validação de e-mail e de
--     anexo, registro do consentimento (data e versão da política).
--  3) Link do cliente: o endereço some depois que o pedido termina.
--  4) Arquivos enviados por visitantes: só nomes gerados pelo site e só
--     extensões permitidas.
--  5) LGPD no painel: exportar e anonimizar os dados de um cliente e
--     aplicar os prazos de guarda automaticamente.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. VISITANTE NÃO TOCA EM TABELA NENHUMA, SÓ NAS FUNÇÕES PERMITIDAS
--    (o RLS já bloqueia; aqui tiramos também a permissão de base)
-- --------------------------------------------------------------------------
revoke all on public.pedidos, public.pedidos_historico, public.config,
              public.filamentos, public.admins from anon;
do $$ begin
  if to_regclass('public.acessos') is not null then
    execute 'revoke all on public.acessos from anon';
    execute 'revoke insert, update, delete on public.acessos from authenticated';
  end if;
end $$;
revoke insert, update, delete on public.site, public.vitrine from anon;
-- ninguém se promove a administrador pelo site: a lista só muda pelo SQL Editor
revoke insert, update, delete on public.admins from authenticated;
revoke insert, update, delete on public.pedidos_historico from authenticated;

-- --------------------------------------------------------------------------
-- 2. PEDIDO DE ORÇAMENTO PELO SITE
-- --------------------------------------------------------------------------
create or replace function public.solicitar_orcamento(
  p_nome text, p_contato text, p_email text, p_descricao text, p_qtd int,
  p_quando text, p_cep text, p_endereco jsonb, p_anexo text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  r public.pedidos;
  v_qtd int := greatest(1, least(coalesce(p_qtd, 1), 10000));
  v_tel text := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_end jsonb := '{}'::jsonb;
  k text;
begin
  -- campos obrigatórios e tamanhos
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(trim(coalesce(p_descricao, ''))) < 3 then raise exception 'Descreva o que você precisa.'; end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then raise exception 'Informe um WhatsApp com DDD.'; end if;
  if length(p_nome) > 120 or length(p_descricao) > 3000 or length(coalesce(p_email, '')) > 160
     or length(coalesce(p_quando, '')) > 120 or length(coalesce(p_cep, '')) > 9
     or length(coalesce(p_endereco::text, '')) > 1500 or length(coalesce(p_anexo, '')) > 120 then
    raise exception 'Algum campo ficou longo demais.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Confira o e-mail informado.';
  end if;
  -- anexo: só o caminho que o próprio site gera
  if p_anexo is not null and p_anexo <> '' and p_anexo !~ '^anexos/[0-9a-f-]{36}\.[a-z0-9]{1,5}$' then
    raise exception 'Anexo inválido.';
  end if;
  -- endereço: só os campos esperados, como texto curto
  if jsonb_typeof(coalesce(p_endereco, '{}'::jsonb)) = 'object' then
    foreach k in array array['rua','numero','complemento','bairro','cidade','uf'] loop
      if p_endereco ? k then v_end := v_end || jsonb_build_object(k, left(trim(p_endereco->>k), 160)); end if;
    end loop;
  end if;

  -- contra robôs e abuso
  if (select count(*) from public.pedidos
      where regexp_replace(coalesce(dados->>'contato', ''), '\D', '', 'g') = v_tel
        and criado_em > now() - interval '1 hour') >= 3
  or (select count(*) from public.pedidos
      where regexp_replace(coalesce(dados->>'contato', ''), '\D', '', 'g') = v_tel
        and criado_em > now() - interval '1 day') >= 5 then
    raise exception 'Muitas solicitações com este telefone. Fale direto pelo WhatsApp.';
  end if;
  if (select count(*) from public.pedidos
      where dados->>'origem' = 'site' and criado_em > now() - interval '1 hour') >= 40 then
    raise exception 'Recebemos muitos pedidos agora. Tente de novo em alguns minutos ou chame no WhatsApp.';
  end if;

  insert into public.pedidos (status, cliente, dados) values ('solicitado', trim(p_nome), jsonb_build_object(
    'cliente', trim(p_nome),
    'contato', trim(p_contato),
    'email', v_email,
    'pedidoCliente', trim(p_descricao),
    'quando', left(coalesce(p_quando, ''), 120),
    'cep', left(coalesce(p_cep, ''), 9),
    'endereco', v_end,
    'anexo', nullif(p_anexo, ''),
    'peca', left(trim(p_descricao), 60),
    'qtd', v_qtd,
    'origem', 'site',
    -- prova do consentimento (LGPD art. 8º): quando e qual versão da política
    'consentimento', jsonb_build_object('em', now(), 'politica', '2026-10', 'finalidade', 'orcamento e entrega')
  )) returning * into r;

  return json_build_object('numero', r.numero, 'token', r.token);
end $$;
revoke all on function public.solicitar_orcamento(text,text,text,text,int,text,text,jsonb,text) from public;
grant execute on function public.solicitar_orcamento(text,text,text,text,int,text,text,jsonb,text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. LINK DO CLIENTE: endereço só enquanto o pedido está em andamento
-- --------------------------------------------------------------------------
create or replace function public.ver_pedido(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  r public.pedidos;
  n jsonb;
  com_preco boolean;
  com_endereco boolean;
  v_validade date;
  v_vencido boolean;
  v_total numeric;
begin
  select * into r from public.pedidos where token = p_token;
  if not found then return null; end if;
  if (r.dados->>'anonimizadoEm') is not null then
    return json_build_object('numero', r.numero, 'status', r.status, 'anonimizado', true);
  end if;
  select coalesce(dados->'negocio', '{}'::jsonb) into n from public.config where id = 1;
  com_preco := r.status not in ('solicitado', 'cancelado', 'perdido');
  com_endereco := r.status not in ('entregue', 'cancelado', 'perdido');
  v_validade := case when (r.dados->>'validadeAte') ~ '^\d{4}-\d{2}-\d{2}$' then (r.dados->>'validadeAte')::date end;
  v_vencido := r.status = 'orcamento' and v_validade is not null and v_validade < current_date;
  v_total := case when (r.dados->>'total') ~ '^[0-9]+(\.[0-9]+)?$' then (r.dados->>'total')::numeric end;

  return json_build_object(
    'numero', r.numero,
    'status', r.status,
    'criado_em', r.criado_em,
    'atualizado_em', r.atualizado_em,
    'cliente', r.dados->>'cliente',
    'pedidoCliente', r.dados->>'pedidoCliente',
    'peca', r.dados->>'peca',
    'material', r.dados->>'materialTexto',
    'qtd', r.dados->'qtd',
    'precoUn', case when com_preco then r.dados->'precoUn' end,
    'desconto', case when com_preco then r.dados->'desconto' end,
    'frete', case when com_preco then r.dados->'entrega' end,
    'freteServico', case when com_preco then r.dados->>'freteServico' end,
    'total', case when com_preco then r.dados->'total' end,
    'prazo', r.dados->>'prazo',
    'recado', r.dados->>'recado',
    'rastreio', r.dados->>'rastreio',
    'cep', case when com_endereco then r.dados->>'cep' end,
    'endereco', case when com_endereco then r.dados->'endereco' end,
    'comprovante', (r.dados->>'comprovante') is not null,
    'validadeAte', v_validade,
    'vencido', v_vencido,
    'validadeDias', n->'validadeDias',
    'whatsapp', n->>'whatsapp',
    'formaPagamento', r.dados->>'formaPagamento',
    'mpStatus', r.dados->>'mpStatus',
    'cartao', case when (n->>'mpAtivo') = 'true' and r.status in ('orcamento', 'aprovado') and not v_vencido and v_total > 0 then json_build_object(
      'valor', round(v_total * (1 + least(greatest(coalesce((n->>'acrescimoCartao')::numeric, 0), 0), 30) / 100), 2),
      'parcelas', least(greatest(coalesce((n->>'parcelasMax')::int, 12), 1), 12)) end,
    'pix', case when r.status in ('orcamento', 'aprovado', 'comprovante') and not v_vencido then json_build_object(
      'chave', n->>'pixChave', 'nome', n->>'pixNome', 'cidade', n->>'pixCidade') end
  );
end $$;
revoke all on function public.ver_pedido(uuid) from public;
grant execute on function public.ver_pedido(uuid) to anon, authenticated;

-- comprovante: mesmo formato de nome que o site gera
create or replace function public.enviar_comprovante(p_token uuid, p_arquivo text) returns json
language plpgsql security definer set search_path = public as $$
declare r public.pedidos;
begin
  select * into r from public.pedidos where token = p_token for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if r.status not in ('orcamento', 'aprovado', 'comprovante') then raise exception 'Este pedido não está aguardando pagamento.'; end if;
  if p_arquivo is null or p_arquivo !~ '^comprovantes/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$' then raise exception 'Arquivo inválido.'; end if;
  update public.pedidos
     set status = 'comprovante',
         dados = dados || jsonb_build_object('comprovante', p_arquivo, 'comprovanteEm', now())
   where id = r.id;
  return json_build_object('ok', true);
end $$;
revoke all on function public.enviar_comprovante(uuid,text) from public;
grant execute on function public.enviar_comprovante(uuid,text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. ARQUIVOS QUE O VISITANTE PODE ENVIAR
--    só nome gerado pelo site (código aleatório) e só extensões permitidas;
--    visitante continua sem poder listar, baixar, trocar ou apagar nada
-- --------------------------------------------------------------------------
update storage.buckets set public = false, file_size_limit = 26214400 where id = 'anexos';
update storage.buckets set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'] where id = 'comprovantes';
update storage.buckets set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'vitrine';

drop policy if exists "razenlab clientes enviam" on storage.objects;
create policy "razenlab clientes enviam" on storage.objects for insert to anon, authenticated
  with check (
    (bucket_id = 'anexos' and name ~ '^[0-9a-f-]{36}\.(stl|3mf|obj|step|stp|zip|jpg|jpeg|png|webp|gif|heic|heif|avif|bmp|tif|tiff|pdf)$')
    or (bucket_id = 'comprovantes' and name ~ '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$')
  );

-- --------------------------------------------------------------------------
-- 5. LGPD NO PAINEL
-- --------------------------------------------------------------------------

-- 5.1 apaga os dados pessoais de um pedido e mantém só o que a contabilidade precisa
create or replace function public._anonimizar_pedido(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare d jsonb; arquivos text[] := '{}';
begin
  select dados into d from public.pedidos where id = p_id for update;
  if d is null or (d->>'anonimizadoEm') is not null then return arquivos; end if;
  if d->>'anexo' is not null then arquivos := arquivos || (d->>'anexo'); end if;
  if d->>'comprovante' is not null then arquivos := arquivos || (d->>'comprovante'); end if;
  update public.pedidos set
    cliente = 'Cliente anonimizado',
    dados = (d - 'cliente' - 'contato' - 'email' - 'cep' - 'endereco' - 'anexo' - 'comprovante'
               - 'pedidoCliente' - 'obs' - 'recado' - 'rastreio' - 'consentimento' - 'mpLink')
            || jsonb_build_object('cliente', 'Cliente anonimizado', 'anonimizadoEm', now())
  where id = p_id;
  return arquivos;
end $$;
revoke all on function public._anonimizar_pedido(uuid) from public, anon, authenticated;

-- 5.2 todos os dados de um cliente (direito de acesso e portabilidade, art. 18)
create or replace function public.admin_lgpd_exportar(p_contato text) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g');
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  if length(v_tel) < 8 then raise exception 'Informe o WhatsApp do cliente.'; end if;
  return (select coalesce(json_agg(json_build_object('numero', numero, 'status', status, 'criado_em', criado_em, 'dados', dados) order by numero), '[]'::json)
          from public.pedidos
          where right(regexp_replace(coalesce(dados->>'contato', ''), '\D', '', 'g'), 8) = right(v_tel, 8));
end $$;

-- 5.3 apagar os dados de um cliente a pedido dele (direito de eliminação, art. 18)
--     devolve a lista de arquivos para o painel apagar do armazenamento
create or replace function public.admin_lgpd_apagar_cliente(p_contato text) returns json
language plpgsql security definer set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(p_contato, ''), '\D', '', 'g'); r record; arquivos text[] := '{}'; n int := 0;
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  if length(v_tel) < 8 then raise exception 'Informe o WhatsApp do cliente.'; end if;
  for r in select id from public.pedidos
           where right(regexp_replace(coalesce(dados->>'contato', ''), '\D', '', 'g'), 8) = right(v_tel, 8) loop
    arquivos := arquivos || public._anonimizar_pedido(r.id); n := n + 1;
  end loop;
  return json_build_object('pedidos', n, 'arquivos', to_json(arquivos));
end $$;

-- 5.4 prazos de guarda (art. 15 e 16): só o necessário, pelo tempo necessário
--     · orçamento pedido e nunca respondido ........ 6 meses
--     · não fechou / cancelado ...................... 12 meses
--     · concluído (entregue) ........................ 5 anos (prazo fiscal), depois anonimiza
--     · anexos do cliente de pedido encerrado ....... apagados 90 dias depois
--     p_aplicar = false só conta, sem mudar nada
create or replace function public.admin_lgpd_prazos(p_aplicar boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare r record; arquivos text[] := '{}'; n_anon int := 0; n_anexo int := 0;
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  for r in select id from public.pedidos where (dados->>'anonimizadoEm') is null and (
             (status = 'solicitado' and criado_em < now() - interval '6 months')
          or (status in ('perdido', 'cancelado') and atualizado_em < now() - interval '12 months')
          or (status = 'entregue' and atualizado_em < now() - interval '5 years')) loop
    n_anon := n_anon + 1;
    if p_aplicar then arquivos := arquivos || public._anonimizar_pedido(r.id); end if;
  end loop;
  for r in select id, dados->>'anexo' as anexo from public.pedidos
           where (dados->>'anonimizadoEm') is null and dados->>'anexo' is not null
             and status in ('entregue', 'cancelado', 'perdido') and atualizado_em < now() - interval '90 days' loop
    n_anexo := n_anexo + 1;
    if p_aplicar then
      arquivos := arquivos || r.anexo;
      update public.pedidos set dados = (dados - 'anexo') || jsonb_build_object('anexoApagadoEm', now()) where id = r.id;
    end if;
  end loop;
  if p_aplicar then
    update public.config set dados = dados || jsonb_build_object('config', coalesce(dados->'config', '{}'::jsonb) || jsonb_build_object('lgpdUltimaLimpeza', now())) where id = 1;
  end if;
  return json_build_object('anonimizar', n_anon, 'anexos', n_anexo, 'arquivos', to_json(arquivos), 'aplicado', p_aplicar);
end $$;

revoke all on function public.admin_lgpd_exportar(text) from public, anon;
revoke all on function public.admin_lgpd_apagar_cliente(text) from public, anon;
revoke all on function public.admin_lgpd_prazos(boolean) from public, anon;
grant execute on function public.admin_lgpd_exportar(text) to authenticated;
grant execute on function public.admin_lgpd_apagar_cliente(text) to authenticated;
grant execute on function public.admin_lgpd_prazos(boolean) to authenticated;

-- --------------------------------------------------------------------------
-- 6. CONFERÊNCIA: as tabelas devem aparecer com RLS ligado (true)
-- --------------------------------------------------------------------------
select c.relname as tabela, c.relrowsecurity as "RLS ligado"
from pg_class c join pg_namespace s on s.oid = c.relnamespace
where s.nspname = 'public' and c.relkind = 'r'
order by 1;
