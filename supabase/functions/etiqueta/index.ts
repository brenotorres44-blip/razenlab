// ==========================================================================
//  RAZENLAB · função "etiqueta"
//  Compra a etiqueta da transportadora no Melhor Envio para um pedido pago,
//  paga com o SALDO da sua carteira do Melhor Envio, gera, devolve o PDF
//  para imprimir e grava o código de rastreio no pedido.
//
//  Ações (POST { acao, pedidoId }):
//    comprar   carrinho → pagamento → geração → PDF → rastreio
//    imprimir  devolve de novo o link do PDF
//    rastrear  busca o código de rastreio (alguns saem minutos depois)
//
//  Quem pode chamar: o administrador logado no painel, ou o mp-webhook
//  (compra automática quando o pedido é pago, se você ligar no painel).
//
//  Segredos: MELHOR_ENVIO_TOKEN com as permissões cart-read, cart-write,
//  shipping-calculate, shipping-checkout, shipping-generate, shipping-print,
//  shipping-tracking (e orders-read). Opcional: MELHOR_ENVIO_EMAIL.
// ==========================================================================

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
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const limitar = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : padrao;
};

Deno.serve(async (req) => {
  const cors = cabecalhos(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const res = await tratar(req).catch((e) => { console.error(e); return resposta({ erro: "Não consegui concluir agora. Tente de novo em instantes." }, 500); });
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
});

// erro do Melhor Envio em texto que dá para entender
function msgME(j: any, status: number) {
  if (status === 401) return "Token do Melhor Envio inválido, vencido ou sem permissão para comprar etiqueta. Gere outro com as permissões do guia (etapa 17).";
  const partes: string[] = [];
  if (j?.message) partes.push(String(j.message));
  if (j?.error) partes.push(String(j.error));
  if (j?.errors && typeof j.errors === "object") for (const v of Object.values(j.errors)) partes.push(Array.isArray(v) ? v.join(" ") : String(v));
  const t = partes.join(" ").trim();
  if (/saldo|balance|insufficient|insuficiente/i.test(t)) return "Saldo insuficiente na carteira do Melhor Envio. Adicione saldo (Pix cai na hora) e tente de novo: a etiqueta já está no carrinho, não será comprada duas vezes.";
  return t ? `Melhor Envio: ${t}` : `O Melhor Envio respondeu com erro ${status}.`;
}

async function tratar(req: Request): Promise<Response> {
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const TOKEN = String(Deno.env.get("MELHOR_ENVIO_TOKEN") ?? "").trim();
  const EMAIL = Deno.env.get("MELHOR_ENVIO_EMAIL") ?? "contato@razenlab.com.br";
  const BASE = Deno.env.get("MELHOR_ENVIO_BASE") ??
    (Deno.env.get("MELHOR_ENVIO_SANDBOX") === "1" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br");
  if (!TOKEN) return resposta({ erro: "Falta cadastrar o segredo MELHOR_ENVIO_TOKEN no Supabase." }, 500);

  // 1) só o admin do painel (ou o mp-webhook, com a chave de serviço)
  const auth = req.headers.get("Authorization") ?? "";
  const interno = auth === `Bearer ${SERVICE}`;
  if (!interno) {
    const adm = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
      method: "POST", headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" }, body: "{}",
    }).catch(() => null);
    if (!adm || !adm.ok || (await adm.json().catch(() => false)) !== true) return resposta({ erro: "Acesso negado. Entre no painel de novo." }, 401);
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  const acao = String(b.acao ?? "");
  const pedidoId = String(b.pedidoId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return resposta({ erro: "Pedido inválido." }, 400);

  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const [rp, rc] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=id,numero,token,status,cliente,dados`, { headers: cab }),
    fetch(`${SUPABASE_URL}/rest/v1/config?id=eq.1&select=dados`, { headers: cab }),
  ]);
  const [p] = rp.ok ? await rp.json() : [];
  const [c] = rc.ok ? await rc.json() : [];
  if (!p) return resposta({ erro: "Pedido não encontrado." }, 404);
  const d = p.dados ?? {}, n = c?.dados?.negocio ?? {}, cfg = c?.dados?.config ?? {};
  if (d.teste === true || d.teste === "true") return resposta({ erro: "Pedido de teste: a etiqueta de verdade não é comprada (custaria dinheiro)." }, 400);

  const me = (caminho: string, corpo?: unknown, metodo = "POST") => fetch(`${BASE}/api/v2/me${caminho}`, {
    method: metodo,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, "User-Agent": `RazenLab (${EMAIL})` },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const gravar = async (extra: Record<string, unknown>) => {
    Object.assign(d, extra);
    await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${p.id}`, { method: "PATCH", headers: { ...cab, Prefer: "return=minimal" }, body: JSON.stringify({ dados: d }) });
  };
  async function rastreio(id: string) {
    const r = await me("/shipment/tracking", { orders: [id] });
    const j = await r.json().catch(() => null);
    const t = j?.[id] ?? (j ? Object.values(j)[0] : null) as any;
    return { codigo: String(t?.tracking ?? "").trim(), me: String(t?.melhorenvio_tracking ?? "").trim(), status: String(t?.status ?? "") };
  }
  async function imprimir(id: string) {
    const r = await me("/shipment/print", { mode: "public", orders: [id] });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.url) throw new Error(msgME(j, r.status));
    return String(j.url);
  }

  // ---------- imprimir de novo / atualizar rastreio ----------
  if (acao === "imprimir" || acao === "rastrear") {
    if (!d.meEnvioId) return resposta({ erro: "Este pedido ainda não tem etiqueta comprada." }, 400);
    try {
      if (acao === "imprimir") { const url = await imprimir(d.meEnvioId); await gravar({ etiquetaUrl: url }); return resposta({ url }); }
      const t = await rastreio(d.meEnvioId);
      const codigo = t.codigo || "";
      if (codigo || t.me) await gravar({ ...(codigo ? { rastreio: codigo.toUpperCase() } : {}), meRastreio: t.me || d.meRastreio || null });
      return resposta({ rastreio: codigo || null, meRastreio: t.me || null, status: t.status });
    } catch (e) { return resposta({ erro: (e as Error).message }, 502); }
  }
  if (acao !== "comprar") return resposta({ erro: "Ação inválida." }, 400);

  // ---------- comprar ----------
  if (!["pago", "imprimindo", "pronto"].includes(p.status)) return resposta({ erro: "Só compro etiqueta de pedido pago e ainda não enviado." }, 400);
  if (d.etiquetaUrl && d.meStatus === "gerada") return resposta({ url: d.etiquetaUrl, rastreio: d.rastreio ?? null, jaExistia: true });

  const e = d.endereco ?? {};
  const servico = Number(d.freteServicoId);
  const faltas: string[] = [];
  if (!e.rua || !e.numero || !e.cidade || !e.uf || soDigitos(d.cep).length !== 8) faltas.push("endereço completo do cliente");
  if (soDigitos(d.cpf).length !== 11 && soDigitos(d.cpf).length !== 14) faltas.push("CPF do cliente");
  if (!Number.isFinite(servico) || servico <= 0) faltas.push("frete escolhido pela cotação do Melhor Envio");
  const remDoc = soDigitos(n.remCpf);
  if (!n.remRua || !n.remNumero || !n.remBairro || !(n.remCidade || n.cidade) || !n.remUF || soDigitos(n.cepOrigem).length !== 8 || (remDoc.length !== 11 && remDoc.length !== 14)) faltas.push("seus dados de remetente (Configurações → Remetente)");
  if (faltas.length) return resposta({ erro: `Falta: ${faltas.join(", ")}.` }, 400);

  const tel = (t: unknown) => { const x = soDigitos(t); return x.length >= 12 && x.startsWith("55") ? x.slice(2) : x; };
  const itens: any[] = Array.isArray(d.itens) && d.itens.length ? d.itens : [{ titulo: d.peca || "Peça impressa em 3D", qtd: d.qtd || 1, preco: Number(d.precoUn) || Number(d.total) || 1, pesoG: Number(d.filamentoTotal) || 150 }];
  const produtos = itens.map((i) => ({ name: String(i.titulo || "Peça impressa em 3D").slice(0, 60), quantity: Math.max(1, Math.round(Number(i.qtd) || 1)), unitary_value: Math.max(1, Math.round((Number(i.preco) || 1) * 100) / 100) }));
  const valor = Math.round(produtos.reduce((s, x) => s + x.quantity * x.unitary_value, 0) * 100) / 100;
  const pac = d.pacote ?? {};
  const pesoKg = pac.weight ?? Math.min(30, Math.max(0.05, (itens.reduce((s, i) => s + (Number(i.pesoG) || 150) * (Number(i.qtd) || 1), 0) + (Number(cfg.embPeso) || 150)) / 1000));
  const volume = {
    weight: limitar(pesoKg, 0.01, 30, 0.3),
    width: limitar(pac.width ?? cfg.embLarg, 1, 100, 15),
    height: limitar(pac.height ?? cfg.embAlt, 1, 100, 10),
    length: limitar(pac.length ?? cfg.embComp, 1, 100, 20),
  };
  const num4 = String(p.numero).padStart(4, "0");
  const corpo = {
    service: servico,
    from: {
      name: String(n.remNome || n.nome || "RazenLab").slice(0, 60), phone: tel(n.whatsapp), email: String(n.email || EMAIL),
      ...(remDoc.length === 14 ? { company_document: remDoc } : { document: remDoc }),
      address: n.remRua, complement: n.remComplemento || "", number: String(n.remNumero), district: n.remBairro,
      city: n.remCidade || String(n.cidade || "").replace(/\s*\/\s*[A-Z]{2}$/, ""), state_abbr: String(n.remUF).toUpperCase(), country_id: "BR", postal_code: soDigitos(n.cepOrigem),
    },
    to: {
      name: String(p.cliente || d.cliente || "Cliente").slice(0, 60), phone: tel(d.contato), email: d.email || undefined,
      ...(soDigitos(d.cpf).length === 14 ? { company_document: soDigitos(d.cpf) } : { document: soDigitos(d.cpf) }),
      address: e.rua, complement: e.complemento || "", number: String(e.numero), district: e.bairro || "",
      city: e.cidade, state_abbr: String(e.uf).toUpperCase(), country_id: "BR", postal_code: soDigitos(d.cep),
    },
    products: produtos,
    volumes: [volume],
    options: { insurance_value: valor, receipt: false, own_hand: false, reverse: false, non_commercial: true, platform: "RazenLab", tags: [{ tag: `Pedido #${num4}`, url: `https://razenlab.com.br/pedido.html?t=${p.token}` }] },
  };

  try {
    // 1) carrinho (reaproveita se já foi para o carrinho numa tentativa anterior)
    let id = String(d.meEnvioId || "");
    if (!id) {
      const r = await me("/cart", corpo);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.id) return resposta({ erro: msgME(j, r.status) }, 502);
      id = String(j.id);
      await gravar({ meEnvioId: id, meStatus: "carrinho", meValor: Number(j.price ?? d.entrega ?? 0) });
    }
    // 2) paga com o saldo da carteira
    if (d.meStatus === "carrinho") {
      const r = await me("/shipment/checkout", { orders: [id] });
      const j = await r.json().catch(() => null);
      if (!r.ok) return resposta({ erro: msgME(j, r.status), etapa: "pagamento" }, 502);
      await gravar({ meStatus: "paga" });
    }
    // 3) gera
    if (d.meStatus === "paga") {
      const r = await me("/shipment/generate", { orders: [id] });
      const j = await r.json().catch(() => null);
      if (!r.ok) return resposta({ erro: msgME(j, r.status), etapa: "geração" }, 502);
      await gravar({ meStatus: "gerada", etiquetaEm: new Date().toISOString() });
    }
    // 4) PDF e rastreio
    const url = await imprimir(id);
    const t = await rastreio(id).catch(() => ({ codigo: "", me: "", status: "" }));
    await gravar({ etiquetaUrl: url, ...(t.codigo ? { rastreio: t.codigo.toUpperCase() } : {}), meRastreio: t.me || null });
    return resposta({ url, rastreio: t.codigo || null, meRastreio: t.me || null });
  } catch (err) {
    return resposta({ erro: (err as Error).message }, 502);
  }
}
