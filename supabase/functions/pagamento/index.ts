// ==========================================================================
//  RAZENLAB · função "pagamento"
//  Cria o link de pagamento do Mercado Pago (cartão de crédito, débito e boleto)
//  para um orçamento. O valor é calculado aqui, a partir do banco — o site
//  nunca informa o preço, então ninguém consegue pagar menos.
//
//  Segredos necessários (Supabase → Edge Functions → Secrets):
//    MP_ACCESS_TOKEN   "Access Token" de produção do Mercado Pago
//  Opcional:
//    SITE_URL          endereço do site (padrão: o seu GitHub Pages)
// ==========================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const centavos = (v: number) => Math.round(v * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  const MP_API = Deno.env.get("MP_API_BASE") ?? "https://api.mercadopago.com";
  const SITE = (Deno.env.get("SITE_URL") ?? "https://brenotorres44-blip.github.io/razenlab/").replace(/\/?$/, "/");
  if (!MP_TOKEN) return resposta({ erro: "Pagamento por cartão ainda não configurado." }, 503);

  let b: { token?: string };
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(b.token ?? "")) return resposta({ erro: "Link inválido." }, 400);

  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const [rp, rc] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/pedidos?token=eq.${b.token}&select=id,numero,status,cliente,dados`, { headers: cab }),
    fetch(`${SUPABASE_URL}/rest/v1/config?id=eq.1&select=dados`, { headers: cab }),
  ]);
  const [p] = rp.ok ? await rp.json() : [];
  const [c] = rc.ok ? await rc.json() : [];
  if (!p) return resposta({ erro: "Pedido não encontrado." }, 404);
  const d = p.dados ?? {}, n = c?.dados?.negocio ?? {};

  if (n.mpAtivo !== true && n.mpAtivo !== "true") return resposta({ erro: "Pagamento por cartão não está disponível no momento." }, 400);
  if (p.status !== "orcamento") return resposta({ erro: "Este pedido não está aguardando pagamento." }, 400);
  if (d.validadeAte && d.validadeAte < hojeSP()) return resposta({ erro: "Este orçamento venceu. Fale com a gente para atualizar." }, 400);
  const total = Number(d.total);
  if (!(total > 0)) return resposta({ erro: "Orçamento sem valor." }, 400);

  const acrescimo = Math.min(Math.max(Number(n.acrescimoCartao ?? 0), 0), 30);
  const valor = centavos(total * (1 + acrescimo / 100));
  const parcelas = Math.min(Math.max(Math.round(Number(n.parcelasMax ?? 12)), 1), 12);

  // reaproveita o link se nada mudou (evita criar vários pagamentos iguais)
  if (d.mpLink && d.mpValor === valor && d.mpParcelas === parcelas) return resposta({ url: d.mpLink, valor });

  const num = "#" + String(p.numero).padStart(4, "0");
  const volta = (st: string) => `${SITE}pedido.html?t=${b.token}&mp=${st}`;
  const corpo: Record<string, unknown> = {
    items: [{
      id: String(p.numero),
      title: `RazenLab · Pedido ${num} · ${String(d.peca ?? "Impressão 3D")}`.slice(0, 250),
      quantity: 1,
      unit_price: valor,
      currency_id: "BRL",
    }],
    payer: { name: String(p.cliente ?? d.cliente ?? "").slice(0, 120), ...(d.email ? { email: d.email } : {}) },
    external_reference: p.id,
    back_urls: { success: volta("ok"), pending: volta("pendente"), failure: volta("erro") },
    auto_return: "approved",
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
    statement_descriptor: "RAZENLAB",
    // o Pix continua pelo caminho sem taxa; aqui só cartão e boleto
    payment_methods: { installments: parcelas, excluded_payment_types: [{ id: "bank_transfer" }, { id: "atm" }] },
  };
  if (d.validadeAte) Object.assign(corpo, { expires: true, expiration_date_to: `${d.validadeAte}T23:59:59.000-03:00` });

  let r: Response;
  try {
    r = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": `${p.id}-${valor}-${parcelas}` },
      body: JSON.stringify(corpo),
    });
  } catch {
    return resposta({ erro: "Não consegui falar com o Mercado Pago. Tente de novo em instantes." }, 502);
  }
  const pref = await r.json().catch(() => null);
  if (!r.ok || !pref?.init_point) {
    return resposta({ erro: r.status === 401 ? "Credencial do Mercado Pago inválida." : "O Mercado Pago recusou a criação do pagamento." }, 502);
  }

  await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${p.id}`, {
    method: "PATCH",
    headers: { ...cab, Prefer: "return=minimal" },
    body: JSON.stringify({ dados: { ...d, mpPreferencia: pref.id, mpLink: pref.init_point, mpValor: valor, mpParcelas: parcelas } }),
  }).catch(() => null);

  return resposta({ url: pref.init_point, valor });
});
