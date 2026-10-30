// ==========================================================================
//  RAZENLAB · função "mp-webhook"
//  O Mercado Pago chama esta função a cada mudança num pagamento.
//  Ela não confia no aviso: consulta o pagamento direto na API do Mercado Pago
//  e só então marca o pedido como Pago.
//
//  Usa os mesmos segredos da função "pagamento": MP_ACCESS_TOKEN (produção) e
//  MP_ACCESS_TOKEN_TESTE (loja-teste). Pagamento de teste só mexe em pedido de
//  teste, e pagamento real só mexe em pedido real — um nunca confirma o outro.
//  Opcional: MP_WEBHOOK_SECRET (assinatura secreta dos webhooks) — se
//  cadastrado, avisos sem assinatura válida são recusados.
// ==========================================================================

const ok = (corpo: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const TIPOS: Record<string, string> = {
  credit_card: "Cartão de crédito", debit_card: "Cartão de débito", ticket: "Boleto",
  bank_transfer: "Pix", account_money: "Saldo Mercado Pago", prepaid_card: "Cartão pré-pago",
};

async function assinaturaValida(req: Request, dataId: string, segredo: string) {
  const sig = req.headers.get("x-signature") ?? "", rid = req.headers.get("x-request-id") ?? "";
  const partes = Object.fromEntries(sig.split(",").map((s) => s.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${dataId};request-id:${rid};ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto)));
  const hex = [...mac].map((x) => x.toString(16).padStart(2, "0")).join("");
  // comparação em tempo constante (não revela quantos caracteres batem)
  if (hex.length !== partes.v1.length) return false;
  let dif = 0;
  for (let i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  const MP_TOKEN_TESTE = Deno.env.get("MP_ACCESS_TOKEN_TESTE");
  const MP_API = Deno.env.get("MP_API_BASE") ?? "https://api.mercadopago.com";
  const SEGREDO = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!MP_TOKEN && !MP_TOKEN_TESTE) return ok({ erro: "sem credencial" }, 503);

  // o aviso pode vir no corpo ({type, data:{id}}) ou na URL (?type=payment&data.id=… / ?topic=payment&id=…)
  const url = new URL(req.url);
  const corpo = await req.json().catch(() => ({}));
  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(corpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !/^\d+$/.test(id)) return ok({ ignorado: true });
  if (SEGREDO && !(await assinaturaValida(req, id, SEGREDO))) return ok({ erro: "assinatura inválida" }, 401);

  // 1) consulta o pagamento na fonte: primeiro na conta de produção, depois na de teste
  let pg: Record<string, any> | null = null, deTeste = false;
  for (const [tk, ehTeste] of [[MP_TOKEN, false], [MP_TOKEN_TESTE, true]] as [string | undefined, boolean][]) {
    if (!tk) continue;
    const rp = await fetch(`${MP_API}/v1/payments/${id}`, { headers: { Authorization: `Bearer ${tk}` } }).catch(() => null);
    if (rp && rp.status === 404) continue;                                     // não é dessa conta
    if (!rp || !rp.ok) return ok({ erro: "pagamento não consultado" }, 502);   // o Mercado Pago tenta de novo depois
    pg = await rp.json(); deTeste = ehTeste; break;
  }
  if (!pg) return ok({ ignorado: true });
  if (pg.live_mode === false) deTeste = true;
  const pedidoId = String(pg.external_reference ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return ok({ ignorado: true });

  // 2) localiza o pedido
  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const rr = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=id,status,dados`, { headers: cab });
  const [p] = rr.ok ? await rr.json() : [];
  if (!p) return ok({ ignorado: true });
  const d = p.dados ?? {};
  const pedidoTeste = d.teste === true || d.teste === "true";
  if (pedidoTeste !== deTeste) return ok({ ignorado: true, motivo: "ambiente diferente" });   // teste não paga pedido real (nem o contrário)
  const ehPix = pg.payment_type_id === "bank_transfer" || pg.payment_method_id === "pix";

  // 3) registra o que aconteceu
  const taxa = (pg.fee_details ?? []).reduce((s: number, f: { amount?: number }) => s + Number(f.amount ?? 0), 0);
  const novo: Record<string, unknown> = {
    ...d,
    mpPagamentoId: String(pg.id),
    mpStatusDetalhe: pg.status_detail ?? null,
  };
  // Pix gerado e ainda não pago não é "processando": a pessoa só não pagou ainda
  if (!(ehPix && pg.status === "pending")) novo.mpStatus = pg.status;
  // Pix que venceu ou foi cancelado: libera para gerar outro
  if (ehPix && ["cancelled", "expired", "rejected"].includes(pg.status) && d.mpPix?.id === String(pg.id)) delete novo.mpPix;
  let status = p.status;
  if (pg.status === "approved") {
    const esperado = ehPix ? Number(d.mpPix?.valor ?? d.total ?? 0) : Number(d.mpValor ?? d.total ?? 0);
    if (Number(pg.transaction_amount) + 0.05 < esperado) {
      novo.mpStatus = "valor_divergente";            // pagou menos que o combinado: fica para você conferir
    } else {
      novo.formaPagamento = `Mercado Pago · ${TIPOS[pg.payment_type_id] ?? pg.payment_type_id}${pg.installments > 1 ? ` em ${pg.installments}x` : ""}`;
      novo.valorRecebido = Number(pg.transaction_amount);
      novo.taxaMercadoPago = Math.round(taxa * 100) / 100;
      novo.liquidoRecebido = Number(pg.transaction_details?.net_received_amount ?? (pg.transaction_amount - taxa));
      delete novo.mpPix;
      if (["solicitado", "orcamento", "aprovado", "comprovante"].includes(p.status)) {
        status = "pago";
        novo.dataPago = d.dataPago ?? hojeSP();
      }
    }
  }
  const up = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${p.id}`, {
    method: "PATCH",
    headers: { ...cab, Prefer: "return=minimal" },
    body: JSON.stringify({ status, dados: novo }),
  }).catch(() => null);
  if (!up || !up.ok) return ok({ erro: "não gravou" }, 500);          // o Mercado Pago tenta de novo
  return ok({ ok: true, status });
});
