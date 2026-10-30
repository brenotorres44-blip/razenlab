// ==========================================================================
//  RAZENLAB · função "loja"
//  Usada pela loja do site (carrinho). Duas ações:
//    cotar     → recebe CEP + itens e devolve as opções de frete
//    finalizar → confere preços NO BANCO, recalcula o frete escolhido,
//                cria o pedido "aguardando pagamento" e devolve o link
//  O navegador nunca define preço nem frete: tudo é recalculado aqui.
//
//  Segredos (Supabase → Edge Functions → Secrets):
//    MELHOR_ENVIO_TOKEN   o mesmo da função "frete"
//    MELHOR_ENVIO_EMAIL   (opcional) seu e-mail
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
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const preco = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const somaDias = (iso: string, d: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const somaDiasUteis = (iso: string, d: number) => {
  const x = new Date(iso + "T12:00:00"); let n = 0;
  while (n < d) { x.setDate(x.getDate() + 1); const w = x.getDay(); if (w !== 0 && w !== 6) n++; }
  return x.toISOString().slice(0, 10);
};
const md = (iso: string) => iso.slice(5, 10);
function colecaoNoAr(c: Record<string, string> | undefined) {
  if (!c) return true;
  if (c.modo === "ligada") return true;
  if (c.modo !== "datas" || !c.inicio || !c.fim) return false;
  const h = md(hojeSP());
  return c.inicio <= c.fim ? (h >= c.inicio && h <= c.fim) : (h >= c.inicio || h <= c.fim);
}

Deno.serve(async (req) => {
  const cors = cabecalhos(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const res = await tratar(req).catch((e) => { console.error(e); return resposta({ erro: "Não consegui concluir agora. Tente de novo em instantes." }, 500); });
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
});

async function tratar(req: Request): Promise<Response> {
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TOKEN = Deno.env.get("MELHOR_ENVIO_TOKEN");
  const EMAIL = Deno.env.get("MELHOR_ENVIO_EMAIL") ?? "contato@razenlab.com.br";
  const BASE = Deno.env.get("MELHOR_ENVIO_BASE") ??
    (Deno.env.get("MELHOR_ENVIO_SANDBOX") === "1" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br");
  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  const acao = String(b.acao ?? "");
  const teste = b.teste === true;

  // ---------- carrinho: confere cada item no banco ----------
  const brutos = Array.isArray(b.itens) ? b.itens.slice(0, 30) : [];
  if (!brutos.length) return resposta({ erro: "O carrinho está vazio." }, 400);
  const ids = [...new Set(brutos.map((i: Record<string, unknown>) => String(i?.id ?? "")).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return resposta({ erro: "Itens inválidos." }, 400);
  const [rv, rc] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/vitrine?id=in.(${ids.join(",")})&visivel=eq.true&select=id,dados,fotos`, { headers: cab }),
    fetch(`${SUPABASE_URL}/rest/v1/config?id=eq.1&select=dados`, { headers: cab }),
  ]);
  const vit: { id: string; dados: Record<string, string>; fotos: string[] }[] = rv.ok ? await rv.json() : [];
  const [c] = rc.ok ? await rc.json() : [];
  const cfg = c?.dados?.config ?? {}, neg = c?.dados?.negocio ?? {};
  const colecoes: Record<string, string>[] = Array.isArray(neg.colecoes) ? neg.colecoes : [];

  const itens: { id: string; titulo: string; qtd: number; preco: number; cor: string; pesoG: number }[] = [];
  for (const bi of brutos as Record<string, unknown>[]) {
    const v = vit.find((x) => x.id === String(bi?.id));
    if (!v) return resposta({ erro: "Uma peça do carrinho não está mais disponível. Atualize a página." }, 409);
    const col = v.dados.colecao ? colecoes.find((x) => x.id === v.dados.colecao) : undefined;
    if (v.dados.colecao && col && !colecaoNoAr(col)) return resposta({ erro: `"${v.dados.titulo}" saiu de época e não está mais à venda.` }, 409);
    const p = preco(v.dados.preco);
    if (!p) return resposta({ erro: `"${v.dados.titulo}" é sob orçamento. Peça pelo formulário do site.` }, 409);
    const qtd = Math.min(20, Math.max(1, Math.round(Number(bi?.qtd) || 1)));
    itens.push({ id: v.id, titulo: v.dados.titulo, qtd, preco: p, cor: texto(bi?.cor, 40), pesoG: Number(v.dados.pesoG) > 0 ? Number(v.dados.pesoG) : 150 });
  }
  const subtotal = Math.round(itens.reduce((s, i) => s + i.preco * i.qtd, 0) * 100) / 100;
  const pesoKg = Math.min(30, Math.max(0.05, (itens.reduce((s, i) => s + i.pesoG * i.qtd, 0) + (Number(cfg.embPeso) || 150)) / 1000));
  const pacote = {
    weight: pesoKg,
    width: Math.min(100, Math.max(1, Number(cfg.embLarg) || 15)),
    height: Math.min(100, Math.max(1, Number(cfg.embAlt) || 10)),
    length: Math.min(100, Math.max(1, Number(cfg.embComp) || 20)),
  };

  // ---------- frete ----------
  const cepDestino = soDigitos(b.cep);
  const cepOrigem = soDigitos(neg.cepOrigem);
  const retirada: { id: string; servico: string; empresa: string; preco: number; prazo: number | null } = { id: "retirada", servico: "Retirar em mãos", empresa: neg.cidade ? `Em ${neg.cidade} · combinamos pelo WhatsApp` : "Combinamos pelo WhatsApp", preco: 0, prazo: null };
  async function cotar() {
    if (cepDestino.length !== 8) throw new Error("Informe um CEP com 8 números.");
    if (!TOKEN) throw new Error("O cálculo de frete ainda não foi configurado.");
    if (cepOrigem.length !== 8) throw new Error("Falta o CEP de origem nas Configurações do painel.");
    const r = await fetch(`${BASE}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, "User-Agent": `RazenLab (${EMAIL})` },
      body: JSON.stringify({ from: { postal_code: cepOrigem }, to: { postal_code: cepDestino }, package: pacote, options: { insurance_value: subtotal, receipt: false, own_hand: false } }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error("Não consegui calcular o frete agora. Tente de novo em instantes.");
    return (Array.isArray(d) ? d : [])
      .filter((o) => !o.error && (o.custom_price ?? o.price))
      .map((o) => ({ id: String(o.id), servico: String(o.name ?? ""), empresa: String(o.company?.name ?? ""), preco: Number(o.custom_price ?? o.price), prazo: Number(o.custom_delivery_time ?? o.delivery_time) || null }))
      .filter((o) => Number.isFinite(o.preco))
      .sort((a, b) => a.preco - b.preco);
  }

  if (acao === "cotar") {
    try { return resposta({ opcoes: [...await cotar(), retirada], subtotal }); }
    catch (e) { return resposta({ erro: (e as Error).message, opcoes: [retirada], subtotal }, 200); }
  }

  if (acao !== "finalizar") return resposta({ erro: "Ação inválida." }, 400);

  // ---------- finalizar ----------
  const cli = (b.cliente ?? {}) as Record<string, unknown>;
  const nome = texto(cli.nome, 120), contato = texto(cli.contato, 20), email = texto(cli.email, 160).toLowerCase();
  if (nome.length < 2) return resposta({ erro: "Informe seu nome." }, 400);
  const tel = soDigitos(contato);
  if (tel.length < 10 || tel.length > 13) return resposta({ erro: "Informe um WhatsApp com DDD." }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta({ erro: "Confira o e-mail." }, 400);
  if (cli.aceite !== true) return resposta({ erro: "Marque a autorização de uso dos dados." }, 400);

  const servicoId = String(b.servicoId ?? "");
  let frete = retirada;
  if (servicoId !== "retirada") {
    let opcoes;
    try { opcoes = await cotar(); } catch (e) { return resposta({ erro: (e as Error).message }, 400); }
    const o = opcoes.find((x) => x.id === servicoId);
    if (!o) return resposta({ erro: "Essa opção de frete não está mais disponível. Calcule o frete de novo." }, 409);
    frete = o;
  }
  const end = (b.endereco ?? {}) as Record<string, unknown>;
  const endereco: Record<string, string> = {};
  for (const k of ["rua", "numero", "complemento", "bairro", "cidade", "uf"]) endereco[k] = texto(end[k], k === "uf" ? 2 : 160);
  if (servicoId !== "retirada" && (!endereco.rua || !endereco.numero || !endereco.cidade || endereco.uf.length !== 2)) {
    return resposta({ erro: "Preencha o endereço de entrega completo." }, 400);
  }

  // contra abuso: até 5 pedidos da loja por telefone por dia
  const desde = new Date(Date.now() - 864e5).toISOString();
  const rr = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?criado_em=gte.${desde}&dados->>origem=in.(loja,loja-teste)&select=dados->>contato`, { headers: cab });
  const recentes: { contato: string }[] = rr.ok ? await rr.json() : [];
  if (recentes.filter((x) => soDigitos(x.contato) === tel).length >= 5) return resposta({ erro: "Muitos pedidos hoje com este telefone. Fale com a gente pelo WhatsApp." }, 429);

  const total = Math.round((subtotal + frete.preco) * 100) / 100;
  const hoje = hojeSP();
  const prazoDias = Math.min(30, Math.max(1, Number(neg.prazoProducaoDias) || 5));
  const resumo = itens.map((i) => `${i.titulo}${i.cor ? ` (${i.cor})` : ""} ×${i.qtd}`).join(" + ");
  const dados = {
    cliente: teste ? `[TESTE] ${nome}` : nome, contato, email: email || null,
    cep: servicoId === "retirada" ? "" : cepDestino, endereco: servicoId === "retirada" ? {} : endereco,
    peca: resumo.slice(0, 120), pedidoCliente: `Compra pela loja do site:\n${itens.map((i) => `• ${i.titulo}${i.cor ? ` · cor: ${i.cor}` : ""} · ${i.qtd} un. × R$ ${i.preco.toFixed(2).replace(".", ",")}`).join("\n")}`,
    itens, qtd: 1, precoManual: subtotal, precoUn: subtotal, desconto: 0,
    entrega: frete.preco, freteServico: frete.id === "retirada" ? "Retirada em mãos" : `${frete.empresa} ${frete.servico}`.trim(),
    total, dataOrcamento: hoje, validadeAte: somaDias(hoje, 2), prazo: somaDiasUteis(hoje, prazoDias + (frete.prazo ?? 0)),
    origem: teste ? "loja-teste" : "loja", teste,
    consentimento: { em: new Date().toISOString(), politica: "2026-10", finalidade: "compra e entrega" },
  };
  const ri = await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
    method: "POST", headers: { ...cab, Prefer: "return=representation" },
    body: JSON.stringify({ status: "orcamento", cliente: dados.cliente, dados }),
  });
  const [novo] = ri.ok ? await ri.json() : [];
  if (!novo) return resposta({ erro: "Não consegui registrar o pedido. Tente de novo." }, 500);
  return resposta({ numero: novo.numero, token: novo.token, total });
}
