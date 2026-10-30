// ==========================================================================
//  RAZENLAB · função "pagamento"
//  Cria o pagamento no Mercado Pago para um pedido (orçamento ou compra da loja).
//  O valor é calculado aqui, a partir do banco — o site nunca informa o preço,
//  então ninguém consegue pagar menos.
//
//  Dois jeitos de pagar:
//    metodo "cartao" (padrão) → link do Checkout Pro: crédito, débito e boleto
//    metodo "pix"             → Pix gerado pelo Mercado Pago, com QR Code e
//                               confirmação automática (sem comprovante)
//
//  Pedido de TESTE (feito na loja-teste) usa SEMPRE as credenciais de teste:
//  nenhum dinheiro de verdade passa por ele.
//
//  Segredos (Supabase → Edge Functions → Secrets):
//    MP_ACCESS_TOKEN         Access Token de PRODUÇÃO do Mercado Pago
//    MP_ACCESS_TOKEN_TESTE   Access Token da CONTA VENDEDORA DE TESTE do Mercado Pago
//                            (credenciais de produção da conta de teste) — para a loja-teste
//  Opcional:
//    SITE_URL                endereço do site (padrão: https://razenlab.com.br/)
// ==========================================================================

// só o site da RazenLab chama esta função pelo navegador (outros endereços: ORIGENS_PERMITIDAS)
const ORIGENS = (Deno.env.get("ORIGENS_PERMITIDAS") ??
  "https://razenlab.com.br,https://www.razenlab.com.br,https://brenotorres44-blip.github.io").split(",").map((o) => o.trim());
const cabecalhos = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" } });
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const centavos = (v: number) => Math.round(v * 100) / 100;
const ligado = (v: unknown) => v === true || v === "true";
const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v) && v.length <= 160;

Deno.serve(async (req) => {
  const cors = cabecalhos(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const res = await tratar(req).catch((e) => { console.error(e); return resposta({ erro: "Não consegui abrir o pagamento agora. Tente de novo em instantes." }, 500); });
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
});

async function tratar(req: Request): Promise<Response> {
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_API = Deno.env.get("MP_API_BASE") ?? "https://api.mercadopago.com";
  const SITE = (Deno.env.get("SITE_URL") ?? "https://razenlab.com.br/").replace(/\/?$/, "/");

  let b: { token?: string; metodo?: string; email?: string };
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(b.token ?? "")) return resposta({ erro: "Link inválido." }, 400);
  const metodo = b.metodo === "pix" ? "pix" : "cartao";

  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const [rp, rc] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/pedidos?token=eq.${b.token}&select=id,numero,status,cliente,dados`, { headers: cab }),
    fetch(`${SUPABASE_URL}/rest/v1/config?id=eq.1&select=dados`, { headers: cab }),
  ]);
  const [p] = rp.ok ? await rp.json() : [];
  const [c] = rc.ok ? await rc.json() : [];
  if (!p) return resposta({ erro: "Pedido não encontrado." }, 404);
  const d = p.dados ?? {}, n = c?.dados?.negocio ?? {};

  // ---------- ambiente: produção ou teste ----------
  const teste = d.teste === true || d.teste === "true";
  const MP_TOKEN = teste ? Deno.env.get("MP_ACCESS_TOKEN_TESTE") : Deno.env.get("MP_ACCESS_TOKEN");
  if (!MP_TOKEN) return resposta({ erro: teste ? "As credenciais de TESTE do Mercado Pago ainda não foram cadastradas." : "Pagamento pelo Mercado Pago ainda não configurado." }, 503);
  if (teste ? !ligado(n.mpTesteAtivo) : !ligado(metodo === "pix" ? n.pixAutoAtivo : n.mpAtivo)) {
    return resposta({ erro: "Esta forma de pagamento não está disponível no momento." }, 400);
  }

  if (!["orcamento", "aprovado"].includes(p.status)) return resposta({ erro: "Este pedido não está aguardando pagamento." }, 400);
  if (d.validadeAte && d.validadeAte < hojeSP()) return resposta({ erro: "O prazo para pagar este pedido venceu. Fale com a gente para atualizar." }, 400);
  const total = centavos(Number(d.total));
  if (!(total > 0)) return resposta({ erro: "Pedido sem valor." }, 400);

  const num = "#" + String(p.numero).padStart(4, "0");
  const descricao = `RazenLab · Pedido ${num} · ${String(d.peca ?? "Impressão 3D")}`.slice(0, 250);
  const gravar = (extra: Record<string, unknown>) => fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${p.id}`, {
    method: "PATCH", headers: { ...cab, Prefer: "return=minimal" }, body: JSON.stringify({ dados: { ...d, ...extra } }),
  }).catch(() => null);
  const chamarMP = async (caminho: string, corpo: unknown, idem: string) => {
    let r: Response;
    try {
      r = await fetch(`${MP_API}${caminho}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": idem },
        body: JSON.stringify(corpo),
      });
    } catch { return { erro: "Não consegui falar com o Mercado Pago. Tente de novo em instantes." }; }
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("mercado pago", r.status, JSON.stringify(j).slice(0, 500));
      return { erro: r.status === 401 ? "Credencial do Mercado Pago inválida." : "O Mercado Pago recusou a criação do pagamento." };
    }
    return { j };
  };

  // ======================= PIX (Mercado Pago) =======================
  if (metodo === "pix") {
    const agora = Date.now();
    const atual = d.mpPix;
    // reaproveita o Pix já gerado enquanto ele vale e o valor não mudou
    if (atual && atual.valor === total && atual.expira && Date.parse(atual.expira) - agora > 5 * 60e3) {
      return resposta({ codigo: atual.codigo, qr: atual.qr, valor: total, expira: atual.expira });
    }
    // o Mercado Pago exige e-mail de quem paga no Pix
    const email = String(d.email || b.email || "").trim().toLowerCase();
    if (!emailOk(email)) return resposta({ erro: "Informe seu e-mail para gerar o Pix.", precisaEmail: true }, 400);

    // vale até o fim do prazo do pedido (mínimo 30 min, máximo 2 dias)
    const fimPrazo = d.validadeAte ? Date.parse(`${d.validadeAte}T23:59:00-03:00`) : agora + 864e5;
    const expira = new Date(Math.min(Math.max(fimPrazo, agora + 31 * 60e3), agora + 2 * 864e5));
    const exp = expira.toISOString().replace("Z", "+00:00").replace(/\.\d{3}/, ".000");
    const nome = String(p.cliente ?? d.cliente ?? "").replace(/^\[TESTE\]\s*/, "").trim();
    const r = await chamarMP("/v1/payments", {
      transaction_amount: total,
      description: descricao,
      payment_method_id: "pix",
      payer: { email, first_name: nome.split(" ")[0] || "Cliente", last_name: nome.split(" ").slice(1).join(" ") || "RazenLab" },
      external_reference: p.id,
      notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      date_of_expiration: exp,
      statement_descriptor: "RAZENLAB",
    }, `${p.id}-pix-${total}-${expira.toISOString().slice(0, 13)}`);
    if (r.erro) return resposta({ erro: r.erro }, 502);
    const t = r.j?.point_of_interaction?.transaction_data ?? {};
    if (!t.qr_code) return resposta({ erro: "O Mercado Pago não devolveu o QR Code do Pix." }, 502);
    const mpPix = { id: String(r.j.id), codigo: t.qr_code, qr: t.qr_code_base64 ?? "", valor: total, expira: expira.toISOString() };
    await gravar({ mpPix, mpAmbiente: teste ? "teste" : "producao", ...(d.email ? {} : { email }) });
    return resposta({ codigo: mpPix.codigo, qr: mpPix.qr, valor: total, expira: mpPix.expira });
  }

  // ======================= CARTÃO E BOLETO (Checkout Pro) =======================
  const acrescimo = Math.min(Math.max(Number(n.acrescimoCartao ?? 0), 0), 30);
  const valor = centavos(total * (1 + acrescimo / 100));
  const parcelas = Math.min(Math.max(Math.round(Number(n.parcelasMax ?? 12)), 1), 12);

  // reaproveita o link se nada mudou (evita criar vários pagamentos iguais)
  if (d.mpLink && d.mpValor === valor && d.mpParcelas === parcelas && (d.mpAmbiente ?? "producao") === (teste ? "teste" : "producao")) {
    return resposta({ url: d.mpLink, valor });
  }

  const volta = (st: string) => `${SITE}pedido.html?t=${b.token}&mp=${st}`;
  const corpo: Record<string, unknown> = {
    items: [{ id: String(p.numero), title: descricao, quantity: 1, unit_price: valor, currency_id: "BRL" }],
    payer: { name: String(p.cliente ?? d.cliente ?? "").replace(/^\[TESTE\]\s*/, "").slice(0, 120), ...(d.email ? { email: d.email } : {}) },
    external_reference: p.id,
    back_urls: { success: volta("ok"), pending: volta("pendente"), failure: volta("erro") },
    auto_return: "approved",
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
    statement_descriptor: "RAZENLAB",
    // o Pix tem o caminho dele; aqui só cartão e boleto
    payment_methods: { installments: parcelas, excluded_payment_types: [{ id: "bank_transfer" }, { id: "atm" }] },
  };
  if (d.validadeAte) Object.assign(corpo, { expires: true, expiration_date_to: `${d.validadeAte}T23:59:59.000-03:00` });

  const r = await chamarMP("/checkout/preferences", corpo, `${p.id}-${valor}-${parcelas}-${teste ? "t" : "p"}`);
  if (r.erro) return resposta({ erro: r.erro }, 502);
  // conta vendedora de TESTE com credencial de produção (o jeito que o Mercado Pago recomenda) usa o init_point;
  // credencial antiga "TEST-" usa o sandbox_init_point
  const link = MP_TOKEN.startsWith("TEST-") ? (r.j.sandbox_init_point ?? r.j.init_point) : r.j.init_point;
  if (!link) return resposta({ erro: "O Mercado Pago recusou a criação do pagamento." }, 502);

  await gravar({ mpPreferencia: r.j.id, mpLink: link, mpValor: valor, mpParcelas: parcelas, mpAmbiente: teste ? "teste" : "producao" });
  return resposta({ url: link, valor });
}
