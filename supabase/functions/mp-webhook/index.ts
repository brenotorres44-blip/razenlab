// ==========================================================================
//  RAZENLAB · função "mp-webhook"
//  O Mercado Pago chama esta função a cada mudança num pagamento.
//  Ela não confia no aviso: consulta o pagamento direto na API do Mercado Pago
//  e só então marca o pedido como Pago.
//
//  Usa o mesmo segredo MP_ACCESS_TOKEN da função "pagamento".
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
  return hex === partes.v1;
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  const MP_API = Deno.env.get("MP_API_BASE") ?? "https://api.mercadopago.com";
  const SEGREDO = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!MP_TOKEN) return ok({ erro: "sem credencial" }, 503);

  // o aviso pode vir no corpo ({type, data:{id}}) ou na URL (?type=payment&data.id=… / ?topic=payment&id=…)
  const url = new URL(req.url);
  const corpo = await req.json().catch(() => ({}));
  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = String(corpo?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !/^\d+$/.test(id)) return ok({ ignorado: true });
  if (SEGREDO && !(await assinaturaValida(req, id, SEGREDO))) return ok({ erro: "assinatura inválida" }, 401);

  // 1) consulta o pagamento na fonte
  const rp = await fetch(`${MP_API}/v1/payments/${id}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } }).catch(() => null);
  if (rp && rp.status === 404) return ok({ ignorado: true });                  // pagamento não existe nessa conta
  if (!rp || !rp.ok) return ok({ erro: "pagamento não consultado" }, 502);   // o Mercado Pago tenta de novo depois
  const pg = await rp.json();
  const pedidoId = String(pg.external_reference ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return ok({ ignorado: true });

  // 2) localiza o pedido
  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const rr = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=id,status,dados`, { headers: cab });
  const [p] = rr.ok ? await rr.json() : [];
  if (!p) return ok({ ignorado: true });
  const d = p.dados ?? {};

  // 3) registra o que aconteceu
  const taxa = (pg.fee_details ?? []).reduce((s: number, f: { amount?: number }) => s + Number(f.amount ?? 0), 0);
  const novo: Record<string, unknown> = {
    ...d,
    mpPagamentoId: String(pg.id),
    mpStatus: pg.status,
    mpStatusDetalhe: pg.status_detail ?? null,
  };
  let status = p.status;
  if (pg.status === "approved") {
    const esperado = Number(d.mpValor ?? d.total ?? 0);
    if (Number(pg.transaction_amount) + 0.05 < esperado) {
      novo.mpStatus = "valor_divergente";            // pagou menos que o combinado: fica para você conferir
    } else {
      novo.formaPagamento = `Mercado Pago · ${TIPOS[pg.payment_type_id] ?? pg.payment_type_id}${pg.installments > 1 ? ` em ${pg.installments}x` : ""}`;
      novo.valorRecebido = Number(pg.transaction_amount);
      novo.taxaMercadoPago = Math.round(taxa * 100) / 100;
      novo.liquidoRecebido = Number(pg.transaction_details?.net_received_amount ?? (pg.transaction_amount - taxa));
      if (["solicitado", "orcamento", "comprovante"].includes(p.status)) {
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
