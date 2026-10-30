-- ==========================================================================
--  RAZENLAB · 05 · pagamento das compras da loja
--  Rode no Supabase → SQL Editor (uma vez). Pode rodar de novo sem problema.
--
--  O que muda na página do pedido (função ver_pedido):
--   • devolve a lista de itens das compras feitas na loja (carrinho)
--   • diz se o pedido é de TESTE (loja-teste) — pedido de teste nunca mostra
--     o seu Pix de verdade, só os meios de teste do Mercado Pago
--   • oferece o "Pix com confirmação automática" (Pix pelo Mercado Pago)
--     quando você ligar no painel
--   • devolve o Pix automático já gerado, para a pessoa não perder o QR
-- ==========================================================================

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
  v_teste boolean;
  v_aberto boolean;
  v_cartao boolean;
  v_pix_auto boolean;
  v_itens json;
  v_pix_mp jsonb;
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
  v_teste := coalesce(r.dados->>'teste', '') = 'true';
  v_aberto := r.status in ('orcamento', 'aprovado') and not v_vencido and coalesce(v_total, 0) > 0;

  -- pedido de verdade usa as chaves de produção; pedido de teste só funciona com o modo teste ligado
  v_cartao   := v_aberto and case when v_teste then (n->>'mpTesteAtivo') = 'true' else (n->>'mpAtivo') = 'true' end;
  v_pix_auto := v_aberto and case when v_teste then (n->>'mpTesteAtivo') = 'true' else (n->>'pixAutoAtivo') = 'true' end;

  if com_preco and jsonb_typeof(r.dados->'itens') = 'array' then
    select json_agg(json_build_object('titulo', i->>'titulo', 'qtd', i->'qtd', 'preco', i->'preco', 'cor', i->>'cor'))
      into v_itens from jsonb_array_elements(r.dados->'itens') i;
  end if;

  if v_pix_auto and jsonb_typeof(r.dados->'mpPix') = 'object' then
    v_pix_mp := jsonb_build_object(
      'codigo', r.dados->'mpPix'->>'codigo', 'qr', r.dados->'mpPix'->>'qr',
      'valor', r.dados->'mpPix'->'valor', 'expira', r.dados->'mpPix'->>'expira');
  end if;

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
    'itens', v_itens,
    'origem', r.dados->>'origem',
    'teste', v_teste,
    'temEmail', coalesce(r.dados->>'email', '') <> '',
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
    'cartao', case when v_cartao then json_build_object(
      'valor', round(v_total * (1 + least(greatest(coalesce((n->>'acrescimoCartao')::numeric, 0), 0), 30) / 100), 2),
      'parcelas', least(greatest(coalesce((n->>'parcelasMax')::int, 12), 1), 12)) end,
    'pixAuto', case when v_pix_auto then json_build_object('valor', round(v_total, 2), 'atual', v_pix_mp) end,
    -- o seu Pix "manual" (chave + comprovante) nunca aparece em pedido de teste
    'pix', case when r.status in ('orcamento', 'aprovado', 'comprovante') and not v_vencido and not v_teste then json_build_object(
      'chave', n->>'pixChave', 'nome', n->>'pixNome', 'cidade', n->>'pixCidade') end
  );
end $$;
revoke all on function public.ver_pedido(uuid) from public;
grant execute on function public.ver_pedido(uuid) to anon, authenticated;

-- comprovante manual não vale para pedido de teste (lá o pagamento é só pelo Mercado Pago de teste)
create or replace function public.enviar_comprovante_guarda() returns trigger
language plpgsql as $$
begin
  if coalesce(new.dados->>'teste', '') = 'true' and new.status = 'comprovante' and old.status is distinct from 'comprovante' then
    raise exception 'Pedido de teste não aceita comprovante.';
  end if;
  return new;
end $$;
drop trigger if exists pedidos_teste_sem_comprovante on public.pedidos;
create trigger pedidos_teste_sem_comprovante before update on public.pedidos
  for each row execute function public.enviar_comprovante_guarda();
