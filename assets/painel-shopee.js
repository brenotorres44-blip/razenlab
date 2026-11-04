/* ==========================================================================
   RAZENLAB · painel · aba SHOPEE
   Preparo de itens para vender na Shopee: do "ideia" ao "publicado".
   Cada item tem custo de produção (mesmo cálculo dos orçamentos), preço com as
   taxas da Shopee, anúncio (título, descrição, fotos, embalagem), checklist e
   registro de vendas — a venda vira um pedido "Pago" que entra no Financeiro.

   Dados: tabela shopee_itens (supabase/06_shopee.sql). Taxas: Configurações
   da aba, guardadas no negócio (privado, nunca vai para o site).
   Usa as funções do painel: precificar, gravarPedido, subirImagem, etc.
   ========================================================================== */
"use strict";

const SH_ETAPAS = [
  ["ideia", "Ideia"], ["modelo", "Modelo e licença"], ["teste", "Teste de impressão"],
  ["fotos", "Fotos"], ["anuncio", "Anúncio pronto"], ["publicado", "Publicado"], ["pausado", "Pausado"]
];
const SH_ROTULO = Object.fromEntries(SH_ETAPAS);
const SH_PREPARO = ["ideia", "modelo", "teste", "fotos", "anuncio"];

// Tabela da Shopee (Central do Vendedor, out/2026). Editável na aba: a Shopee muda isso de tempos em tempos.
const SH_TAXAS_PADRAO = {
  faixas: [
    { ate: 79.99, pct: 20, fixo: 4.5 },
    { ate: 99.99, pct: 14, fixo: 16 },
    { ate: 199.99, pct: 14, fixo: 20 },
    { ate: null, pct: 14, fixo: 26 }
  ],
  baratoAte: 9,      // abaixo disso, a tarifa fixa é metade do preço
  extraCpf: 3,       // CPF com mais de 450 pedidos em 90 dias paga isto a mais por item
  revisado: "2026-10"
};
const SH_CONTAS = [["cpf", "CPF (até 450 pedidos em 90 dias)"], ["cpf450", "CPF (mais de 450 pedidos em 90 dias)"], ["cnpj", "CNPJ"]];

const SH_ZERO = () => ({
  id: null, nome: "", categoria: "", etapa: "ideia", modeloLink: "", modeloProprio: false, licencaOk: false, testeOk: false, fotosOk: false,
  filamentoId: "", peso: "", horas: "", minutos: "", acabamento: "", extras: "", preco: "", freteVendedor: "", margemAlvo: 30,
  titulo: "", descricao: "", palavras: "", variacoes: "", sku: "", pesoEmb: "", dimC: "", dimL: "", dimA: "",
  fotos: [], estoquePronto: 0, vendidas: 0, linkAnuncio: "", notas: ""
});

let SH = { itens: null, carregando: false, semTabela: false, erro: "", filtro: "todos" };
let shAberto = null;

/* ---------- dados ---------- */
const shDaLinha = r => ({ ...SH_ZERO(), ...r.dados, id: r.id, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em });
async function shCarregar(forcar){
  if(SH.carregando || (SH.itens && !forcar)) return;
  SH.carregando = true; SH.erro = "";
  try{
    const r = await sb.from("shopee_itens").select("id,dados,criado_em,atualizado_em").order("criado_em", { ascending: true });
    if(r.error){
      if(r.error.code === "42P01" || r.error.code === "PGRST205" || /shopee_itens/.test(r.error.message || "")) SH.semTabela = true;
      else throw r.error;
      SH.itens = [];
    }else{ SH.semTabela = false; SH.itens = r.data.map(shDaLinha); }
  }catch(e){ SH.erro = erroTexto(e); SH.itens = []; }
  SH.carregando = false;
  if(aba === "shopee" && !document.querySelector("#modal .ov")) render();
}
async function shGravar(it){
  const fotos = [];
  for(const f of (it.fotos || [])) fotos.push(String(f).startsWith("data:") ? await subirImagem("vitrine", f) : f);
  it.fotos = fotos;
  const { id, criadoEm, atualizadoEm, ...d } = it;
  const r = id ? await sb.from("shopee_itens").update({ dados: d }).eq("id", id).select().single()
               : await sb.from("shopee_itens").insert({ dados: d }).select().single();
  if(r.error) throw r.error;
  const novo = shDaLinha(r.data);
  const i = SH.itens.findIndex(x => x.id === novo.id);
  if(i >= 0) SH.itens[i] = novo; else SH.itens.push(novo);
  return novo;
}

/* ---------- taxas e preço ---------- */
function shTabela(){
  const t = dados.negocio.shopeeTaxas;
  return t && Array.isArray(t.faixas) && t.faixas.length ? t : SH_TAXAS_PADRAO;
}
const shConta = () => dados.negocio.shopeeConta || "cpf";
function shTaxa(preco, conta = shConta(), tab = shTabela()){
  const p = num(preco);
  const faixa = tab.faixas.find(f => f.ate == null || f.ate === "" || p <= num(f.ate)) || tab.faixas[tab.faixas.length - 1];
  const comissao = p * num(faixa.pct) / 100;
  const fixo = p > 0 && p < num(tab.baratoAte) ? p / 2 : num(faixa.fixo);
  const extra = conta === "cpf450" ? num(tab.extraCpf) : 0;
  return { faixa, comissao, fixo, extra, total: comissao + fixo + extra };
}
function shCalc(it){
  const c = precificar({ peso: it.peso, horas: it.horas, minutos: it.minutos, acabamento: it.acabamento, extras: it.extras, filamentoId: it.filamentoId, qtd: 1 });
  const preco = num(it.preco), frete = num(it.freteVendedor);
  const tx = shTaxa(preco);
  const liquido = preco - tx.total;
  const lucro = liquido - c.custo - frete;
  return { c, preco, frete, tx, liquido, lucro, margem: preco > 0 ? lucro / preco * 100 : 0,
           minimo: shSugerido(c.custo, frete, 0), sugerido: shSugerido(c.custo, frete, num(it.margemAlvo)) };
}
// menor preço (terminado em ,90) que dá a margem pedida, respeitando a faixa de taxa em que ele cai
function shSugerido(custo, frete, margemPct){
  const tab = shTabela(), conta = shConta(), m = margemPct / 100;
  let de = 0;
  for(const f of tab.faixas){
    const ate = f.ate == null || f.ate === "" ? 1e6 : num(f.ate);
    const den = 1 - num(f.pct) / 100 - m;
    if(den > 0){
      const p = (custo + frete + num(f.fixo) + (conta === "cpf450" ? num(tab.extraCpf) : 0)) / den;
      const bonito = Math.floor(p) + 0.9 >= p ? Math.floor(p) + 0.9 : Math.ceil(p) + 0.9;
      const alvo = Math.max(bonito, de);
      if(alvo <= ate) return Math.round(alvo * 100) / 100;
    }
    de = ate + 0.01;
  }
  return 0;
}
// a faixa de R$ 80 tem tarifa fixa muito maior: às vezes vender por R$ 79,99 rende mais
function shDicaFaixa(it, calc){
  const p = calc.preco, tab = shTabela(), f1 = tab.faixas[0];
  if(!f1 || f1.ate == null || p <= num(f1.ate) || p > num(f1.ate) + 25) return "";
  const teto = num(f1.ate), liqTeto = teto - shTaxa(teto).total;
  return liqTeto >= calc.liquido ? `A ${brl(teto)} você recebe ${brl(liqTeto)}, mais do que a ${brl(p)} (${brl(calc.liquido)}): a faixa a partir de ${brl(teto + 0.01)} tem tarifa fixa maior.` : "";
}

/* ---------- checklist ---------- */
function shChecklist(it){
  const calc = shCalc(it), tit = String(it.titulo || "").trim(), desc = String(it.descricao || "").trim();
  return [
    ["licenca", "Licença: modelo próprio ou com uso comercial liberado", !!(it.modeloProprio || it.licencaOk), "manual"],
    ["teste", "Teste de impressão aprovado", !!it.testeOk, "manual"],
    ["custo", "Peso e tempo de impressão preenchidos", num(it.peso) > 0 && (num(it.horas) + num(it.minutos)) > 0],
    ["lucro", "Preço com lucro depois das taxas", calc.preco > 0 && calc.lucro > 0],
    ["titulo", "Título com 20 a 120 caracteres", tit.length >= 20 && tit.length <= 120],
    ["descricao", "Descrição completa (150+ caracteres)", desc.length >= 150],
    ["fotos", "Fotos: 3 ou mais (o ideal são 9)", (it.fotos || []).length >= 3 || !!it.fotosOk],
    ["embalagem", "Peso e medidas da embalagem", num(it.pesoEmb) > 0 && num(it.dimC) > 0 && num(it.dimL) > 0 && num(it.dimA) > 0],
    ["sku", "SKU (código do item)", String(it.sku || "").trim().length > 0]
  ];
}
const shTemCusto = it => num(it.peso) > 0 && (num(it.horas) + num(it.minutos)) > 0;
const shProgresso = it => { const l = shChecklist(it); return { ok: l.filter(x => x[2]).length, total: l.length }; };

/* ---------- textos ---------- */
function shMaterial(it){
  const f = dados.filamentos.find(x => x.id === it.filamentoId);
  return f ? [f.material, f.cor].filter(Boolean).join(" ") : "PLA";
}
function shDescricaoModelo(it){
  const nome = it.nome || "Peça impressa em 3D";
  const med = num(it.dimA) ? `Embalagem: ${dec(num(it.dimC), 0)} × ${dec(num(it.dimL), 0)} × ${dec(num(it.dimA), 0)} cm` : "Medidas: [PREENCHER altura × largura em cm]";
  const cores = String(it.variacoes || "").trim();
  return `${nome} — RazenLab

✨ DETALHES
• Material: ${shMaterial(it)}, impresso em 3D camada por camada
• Produzido aqui no Brasil e conferido peça por peça
${cores ? `• Cores disponíveis: ${cores}\n` : ""}
📏 MEDIDAS
• ${med}

📦 O QUE VEM NA EMBALAGEM
• 1 ${nome}
• Embalado com proteção, pronto para presente

⚠️ IMPORTANTE
• Peça decorativa, não é brinquedo (contém partes pequenas)
• Evite sol direto e calor forte (carro fechado): o material pode deformar
• Pequenas marcas de camada são características da impressão 3D
• As cores podem variar um pouco conforme a tela

Ficou com dúvida? Chama no chat da loja!`;
}

/* ---------- tela ---------- */
TELAS.shopee = () => {
  if(!SH.itens){ shCarregar(); return `<div class="pn rv"><div class="vazio"><span class="lbl">Carregando</span>Buscando seus itens da Shopee…</div></div>`; }
  if(SH.semTabela) return `<div class="pn rv" style="--d:40ms">
    <div class="ph"><h2>Aba Shopee</h2><span class="cod">FALTA 1 PASSO</span></div>
    <p class="p13 muted" style="margin:0 0 10px">Para guardar os itens, rode o arquivo <b>supabase/06_shopee.sql</b> no Supabase (SQL Editor → colar → Run). Depois recarregue o painel.</p>
    <p class="dica">Passo a passo no guia, etapa 14.</p></div>`;
  if(SH.erro) return `<div class="pn rv"><div class="vazio"><span class="lbl">Não carregou</span>${esc(SH.erro)}<br><button class="tb min" data-sh-recarregar style="margin-top:12px">Tentar de novo</button></div></div>`;

  const itens = SH.itens;
  const preparo = itens.filter(i => SH_PREPARO.includes(i.etapa)), publicados = itens.filter(i => i.etapa === "publicado");
  const lucros = publicados.filter(shTemCusto).map(i => shCalc(i)).filter(c => c.preco > 0);
  const mes = hoje().slice(0, 7);
  const vendasMes = dados.pedidos.filter(p => p.origem === "shopee" && (p.dataPago || "").startsWith(mes) && !["cancelado"].includes(p.status));
  const unMes = vendasMes.reduce((s, p) => s + num(p.qtd), 0), lucroMes = vendasMes.reduce((s, p) => s + lucroReal(p), 0);
  const filtros = [["todos", "Todos"], ["preparo", "Em preparo"]].concat(SH_ETAPAS);
  const lista = itens.filter(i => SH.filtro === "todos" || (SH.filtro === "preparo" ? SH_PREPARO.includes(i.etapa) : i.etapa === SH.filtro));
  const conta = SH_CONTAS.find(c => c[0] === shConta());

  return `
  <section class="kpis">
    <div class="pn kpi rv" style="--d:60ms"><div class="lbl">Em preparo</div><div class="v">${preparo.length}</div><div class="dl">${SH_PREPARO.map(e => [itens.filter(i => i.etapa === e).length, SH_ROTULO[e].toLowerCase()]).filter(x => x[0]).map(x => `${x[0]} em ${x[1]}`).join(" · ") || "nenhum agora"}</div></div>
    <div class="pn kpi rv" style="--d:120ms"><div class="lbl">Publicados</div><div class="v">${publicados.length}</div><div class="dl">${itens.filter(i => i.etapa === "pausado").length} pausado(s)</div></div>
    <div class="pn kpi rv" style="--d:180ms"><div class="lbl">Lucro médio por venda</div><div class="v">${lucros.length ? brl(lucros.reduce((s, c) => s + c.lucro, 0) / lucros.length) : "—"}</div><div class="dl">${lucros.length ? `margem média ${dec(lucros.reduce((s, c) => s + c.margem, 0) / lucros.length, 0)}%` : "dos itens publicados"}</div></div>
    <div class="pn kpi rv" style="--d:240ms"><div class="lbl">Vendas no mês</div><div class="v">${unMes}</div><div class="dl">${unMes ? `lucro ${brl(lucroMes)}` : "registre em cada item"}</div></div>
  </section>

  <div class="row rv" style="--d:60ms;margin-bottom:14px;gap:10px;flex-wrap:wrap">
    <div class="chips" style="flex:1 1 320px">${filtros.map(([k, t]) => `<button class="chip ${SH.filtro === k ? "on" : ""}" data-sh-filtro="${k}">${t}</button>`).join("")}</div>
    <button class="tb" data-sh-taxas>Taxas da Shopee</button>
    <button class="tb pri" data-sh-novo>+ Novo item</button>
  </div>
  <p class="dica rv" style="--d:70ms;margin:0 0 14px">Conta: <b>${esc(conta ? conta[1] : "CPF")}</b> · tabela de taxas revisada em ${esc(shTabela().revisado || "—")}. Confira em <b>Taxas da Shopee</b> sempre que a Shopee anunciar mudança.</p>

  ${lista.length ? `<div class="sh-grid">${lista.map((it, k) => shCard(it, k)).join("")}</div>`
    : `<div class="pn rv" style="--d:90ms"><div class="vazio"><span class="lbl">${itens.length ? "Nada nesta etapa" : "Nenhum item ainda"}</span>${itens.length ? "Troque o filtro acima." : "Comece com <b>+ Novo item</b>: escolha a peça, calcule o preço com as taxas e siga o checklist até publicar."}
      ${!itens.length && typeof NATAL !== "undefined" ? `<br><button class="tb min" data-sh-natal style="margin-top:14px">Trazer as 8 peças de Natal já prontas</button>` : ""}</div></div>`}

  <div class="pn rv" style="--d:140ms;margin-top:16px">
    <div class="ph"><h2>Como a aba funciona</h2></div>
    <ol class="sh-passos">
      <li><b>Ideia → Modelo e licença:</b> anote o link do modelo. Só venda modelo seu ou com licença comercial (no MakerWorld, confira "uso comercial").</li>
      <li><b>Teste de impressão:</b> imprima uma vez, pese a peça e anote o tempo. O custo sai na hora, com o mesmo cálculo dos orçamentos.</li>
      <li><b>Preço:</b> a calculadora já desconta comissão e tarifa da Shopee e sugere o preço para a margem que você quer.</li>
      <li><b>Fotos e anúncio:</b> título, descrição (tem um modelo pronto), embalagem e SKU. Copie e cole na Central do Vendedor.</li>
      <li><b>Publicado:</b> a cada venda, toque em <b>Registrar venda</b>. Ela vira um pedido Pago e entra no Financeiro com as taxas descontadas.</li>
    </ol>
  </div>`;
};
function shCard(it, k){
  const calc = shCalc(it), pr = shProgresso(it), foto = (it.fotos || [])[0];
  const cor = calc.preco <= 0 ? "var(--muted)" : calc.lucro > 0 ? "var(--positive)" : "var(--negative)";
  return `<div class="pn hov sh-card rv" style="--d:${80 + k * 30}ms">
    <button class="sh-abre" data-sh-abrir="${it.id}" aria-label="Abrir ${esc(it.nome || "item")}">
      <span class="sh-th">${foto ? `<img src="${esc(foto)}" alt="">` : `<span>${esc((it.nome || "?").slice(0, 1).toUpperCase())}</span>`}</span>
      <span class="sh-tx">
        <span class="sh-et sh-${it.etapa}">${esc(SH_ROTULO[it.etapa] || it.etapa)}</span>
        <b>${esc(it.nome || "Item sem nome")}</b>
        <span class="p13 muted">${calc.preco <= 0 ? "sem preço ainda" : !shTemCusto(it) ? `${brl(calc.preco)} · <span style="color:var(--warning)">falta peso e tempo para ver o lucro</span>` : `${brl(calc.preco)} · <span style="color:${cor}">lucro ${brl(calc.lucro)} (${dec(calc.margem, 0)}%)</span>`}</span>
      </span>
    </button>
    <div class="sh-pr"><div class="trilho"><i data-largura="${Math.round(pr.ok / pr.total * 100)}%"></i></div><span class="p13 faint">${pr.ok}/${pr.total}</span></div>
    <div class="row" style="gap:8px;margin-top:10px">
      ${it.etapa !== "publicado" && it.etapa !== "pausado" ? `<button class="tb min" data-sh-avancar="${it.id}">Avançar → ${esc(SH_ROTULO[SH_ETAPAS[SH_ETAPAS.findIndex(e => e[0] === it.etapa) + 1][0]])}</button>` : ""}
      ${it.etapa === "publicado" ? `<button class="tb min pri" data-sh-venda="${it.id}">Registrar venda</button>` : ""}
      <span class="p13 faint dir">${num(it.vendidas) ? `${num(it.vendidas)} vendida(s)` : ""}${num(it.estoquePronto) ? ` · ${num(it.estoquePronto)} pronta(s)` : ""}</span>
    </div>
  </div>`;
}

/* ---------- janela do item ---------- */
function shAbrir(it){
  shAberto = it ? JSON.parse(JSON.stringify(it)) : SH_ZERO();
  shDesenhar();
}
function shDesenhar(){
  const it = shAberto;
  const t = (n, r, ph = "", extra = "") => `<label class="f"><span>${r}</span><input name="${n}" value="${esc(it[n] ?? "")}" placeholder="${esc(ph)}" ${extra}></label>`;
  const n_ = (n, r, u, ph = "0") => `<label class="f"><span>${r}</span><div class="campo">${u === "R$" ? `<span class="u">R$</span>` : ""}<input class="num" name="${n}" inputmode="decimal" value="${esc(it[n] ?? "")}" placeholder="${ph}">${u && u !== "R$" ? `<span class="u">${u}</span>` : ""}</div></label>`;
  const ck = (n, r) => `<label class="chk"><input type="checkbox" name="${n}" ${it[n] ? "checked" : ""}> ${r}</label>`;
  const fils = dados.filamentos.map(f => `<option value="${f.id}" ${it.filamentoId === f.id ? "selected" : ""}>${esc(f.nome)} — ${brl(num(f.precoKg))}/kg</option>`).join("");
  document.getElementById("modal").innerHTML = `
  <div class="ov" data-fechar><div class="md"><div class="pn" id="sh-form">
    <div class="md-h"><h2>${it.id ? esc(it.nome || "Item da Shopee") : "Novo item para a Shopee"}</h2><button class="x" data-fechar aria-label="Fechar">&times;</button></div>
    <div class="sh-ed">
      <div class="sh-col">
        <div class="grid g2">
          ${t("nome", "Nome da peça", "Vaso geométrico")}
          <label class="f"><span>Etapa</span><select name="etapa">${SH_ETAPAS.map(([k, r]) => `<option value="${k}" ${it.etapa === k ? "selected" : ""}>${r}</option>`).join("")}</select></label>
          ${t("categoria", "Categoria", "Decoração, Geek, Utilidades")}
          ${t("sku", "SKU", "RZL-001")}
        </div>

        <div class="sep"></div><div class="lbl" style="margin-bottom:8px">MODELO E LICENÇA</div>
        ${t("modeloLink", "Link do modelo", "https://makerworld.com/…")}
        <div class="grid g2" style="margin-top:8px">${ck("modeloProprio", "Modelo meu")}${ck("licencaOk", "Licença comercial confirmada")}</div>

        <div class="sep"></div><div class="lbl" style="margin-bottom:8px">PRODUÇÃO (UMA PEÇA)</div>
        <label class="f"><span>Filamento</span><select name="filamentoId"><option value="">Preço padrão (${brl(num(dados.config.precoFilamento))}/kg)</option>${fils}</select></label>
        <div class="grid g3" style="margin-top:8px">
          ${n_("peso", "Peso", "g")}${n_("horas", "Horas", "h")}${n_("minutos", "Minutos", "min")}
          ${n_("acabamento", "Acabamento", "min")}${n_("extras", "Embalagem e insumos", "R$")}${n_("estoquePronto", "Prontas em estoque", "un")}
        </div>
        <div class="grid g2" style="margin-top:8px">${ck("testeOk", "Teste de impressão aprovado")}</div>

        <div class="sep"></div><div class="lbl" style="margin-bottom:8px">PREÇO NA SHOPEE</div>
        <div class="grid g3">${n_("preco", "Preço de venda", "R$")}${n_("freteVendedor", "Frete que você paga", "R$")}${n_("margemAlvo", "Margem desejada", "%", "30")}</div>

        <div class="sep"></div><div class="lbl" style="margin-bottom:8px">ANÚNCIO</div>
        <label class="f"><span>Título <span class="faint" id="sh-cont">${String(it.titulo || "").length}/120</span></span><input name="titulo" maxlength="120" value="${esc(it.titulo || "")}" placeholder="Vaso Geométrico Decorativo Impresso em 3D Suculenta Mesa Sala"></label>
        <label class="f" style="margin-top:8px"><span>Descrição</span><textarea name="descricao" rows="9" style="width:100%;resize:vertical">${esc(it.descricao || "")}</textarea></label>
        <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="tb min" data-sh-modelo-desc>Usar descrição modelo</button>
          <button class="tb min" data-sh-copiar="titulo">Copiar título</button>
          <button class="tb min" data-sh-copiar="descricao">Copiar descrição</button>
        </div>
        <div class="grid g2" style="margin-top:8px">${t("palavras", "Palavras-chave", "vaso, suculenta, decoração")}${t("variacoes", "Variações (cores)", "Preto, Branco, Verde")}</div>
        <div class="grid g3" style="margin-top:8px">${n_("pesoEmb", "Peso embalado", "g")}${n_("dimC", "Comprimento", "cm")}${n_("dimL", "Largura", "cm")}${n_("dimA", "Altura", "cm")}</div>
        ${t("linkAnuncio", "Link do anúncio na Shopee", "https://shopee.com.br/…")}

        <div class="sep"></div><div class="lbl" style="margin-bottom:8px">FOTOS · ATÉ 9 · A PRIMEIRA É A CAPA</div>
        <div class="fotos">${(it.fotos || []).map((f, i) => `<div class="foto"><img src="${esc(f)}" alt=""><button data-sh-delfoto="${i}" aria-label="Remover foto">&times;</button>${i ? `<button class="capa" data-sh-capa="${i}" title="Usar como capa">capa</button>` : `<span class="capa on">capa</span>`}</div>`).join("")}${(it.fotos || []).length < 9 ? `<button class="foto-add" data-sh-addfoto>+ Foto</button>` : ""}</div>
        <div style="margin-top:8px">${ck("fotosOk", "As fotos já estão prontas fora do painel")}</div>
        <label class="f" style="margin-top:8px"><span>Anotações</span><textarea name="notas" rows="3" style="width:100%;resize:vertical">${esc(it.notas || "")}</textarea></label>
      </div>

      <aside class="sh-lado">
        <div id="sh-calc">${shCalcHTML(it)}</div>
        <div id="sh-check" style="margin-top:16px">${shCheckHTML(it)}</div>
        <div class="row" style="gap:8px;margin-top:16px;flex-wrap:wrap">
          <button class="tb pri" data-sh-salvar>Salvar</button>
          ${it.id && it.etapa === "publicado" ? `<button class="tb" data-sh-venda="${it.id}">Registrar venda</button>` : ""}
          ${it.id ? `<button class="tb perigo dir" data-sh-excluir>Excluir</button>` : ""}
        </div>
      </aside>
    </div>
  </div></div></div>`;
  document.body.style.overflow = "hidden";
}
function shCalcHTML(it){
  const k = shCalc(it), dica = shDicaFaixa(it, k);
  const linha = (r, v, cl = "") => `<div class="li ${cl}"><span>${r}</span><span>${v}</span></div>`;
  return `<div class="lbl" style="margin-bottom:6px">CALCULADORA · POR VENDA</div>
    ${linha("Custo de produção", brl(k.c.custo))}
    <div class="p13 faint" style="margin:-2px 0 6px">filamento ${brl(k.c.material)} · energia ${brl(k.c.energia)} · máquina ${brl(k.c.maquina)} · seu tempo ${brl(k.c.trabalho)}${num(it.extras) ? ` · embalagem ${brl(num(it.extras))}` : ""}</div>
    ${!shTemCusto(it) ? `<p class="p13" style="color:var(--warning);margin:4px 0 8px">Preencha peso e tempo de impressão: sem isso o custo fica zerado e o lucro sai errado.</p>` : ""}
    ${k.preco > 0 ? `
    ${linha(`Comissão Shopee (${dec(num(k.tx.faixa.pct), 0)}%)`, "− " + brl(k.tx.comissao))}
    ${linha("Tarifa fixa por item", "− " + brl(k.tx.fixo))}
    ${k.tx.extra ? linha("Adicional CPF", "− " + brl(k.tx.extra)) : ""}
    ${k.frete ? linha("Frete que você paga", "− " + brl(k.frete)) : ""}
    ${linha("Você recebe da Shopee", brl(k.liquido))}
    <div class="li" style="font-size:18px;padding-top:8px"><span>Lucro</span><span style="color:${k.lucro > 0 ? "var(--positive)" : "var(--negative)"}">${brl(k.lucro)} · ${dec(k.margem, 0)}%</span></div>` : `<p class="p13 muted" style="margin:8px 0">Coloque o preço de venda para ver o lucro.</p>`}
    <div class="sep" style="margin:10px 0"></div>
    ${linha("Preço mínimo (lucro zero)", k.minimo ? brl(k.minimo) : "—")}
    ${linha(`Preço para ${dec(num(it.margemAlvo), 0)}% de margem`, k.sugerido ? `<b>${brl(k.sugerido)}</b>` : "—")}
    ${k.sugerido && Math.abs(k.sugerido - k.preco) > 0.009 ? `<button class="tb min" data-sh-usar-sugerido style="margin-top:6px">Usar ${brl(k.sugerido)}</button>` : ""}
    ${dica ? `<p class="dica" style="color:var(--warning)">${esc(dica)}</p>` : ""}`;
}
function shCheckHTML(it){
  const l = shChecklist(it), ok = l.filter(x => x[2]).length;
  return `<div class="lbl" style="margin-bottom:6px">CHECKLIST · ${ok}/${l.length}</div>
    <div class="trilho" style="margin-bottom:8px"><i style="width:${Math.round(ok / l.length * 100)}%"></i></div>
    <ul class="sh-ck">${l.map(([, r, f]) => `<li class="${f ? "ok" : ""}"><span aria-hidden="true">${f ? "✓" : "○"}</span>${esc(r)}</li>`).join("")}</ul>
    ${ok === l.length && SH_PREPARO.includes(it.etapa) ? `<p class="dica" style="color:var(--positive)">Tudo pronto: publique na Shopee e mude a etapa para <b>Publicado</b>.</p>` : ""}`;
}
function shLer(){
  const box = document.getElementById("sh-form"); if(!box || !shAberto) return;
  Object.assign(shAberto, lerCampos(box));
}
function shAtualizarLado(){
  shLer();
  const a = document.getElementById("sh-calc"), b = document.getElementById("sh-check"), c = document.getElementById("sh-cont");
  if(a) a.innerHTML = shCalcHTML(shAberto);
  if(b) b.innerHTML = shCheckHTML(shAberto);
  if(c) c.textContent = `${String(shAberto.titulo || "").length}/120`;
}

/* ---------- taxas (janela) ---------- */
function shJanelaTaxas(){
  const t = shTabela();
  document.getElementById("modal").innerHTML = `
  <div class="ov" data-fechar><div class="md est"><div class="pn" id="sh-tx">
    <div class="md-h"><h2>Taxas da Shopee</h2><button class="x" data-fechar aria-label="Fechar">&times;</button></div>
    <label class="f"><span>Sua conta</span><select name="conta">${SH_CONTAS.map(([k, r]) => `<option value="${k}" ${shConta() === k ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    <div class="lbl" style="margin:16px 0 8px">FAIXAS DE PREÇO DO ITEM</div>
    ${t.faixas.map((f, i) => `<div class="grid g3" style="margin-bottom:8px">
      <label class="f"><span>${i === t.faixas.length - 1 ? "Acima disso" : "Até"}</span><div class="campo"><span class="u">R$</span><input class="num" name="ate${i}" value="${f.ate == null ? "" : String(f.ate).replace(".", ",")}" ${i === t.faixas.length - 1 ? "disabled placeholder=\"sem limite\"" : ""}></div></label>
      <label class="f"><span>Comissão</span><div class="campo"><input class="num" name="pct${i}" value="${String(f.pct).replace(".", ",")}"><span class="u">%</span></div></label>
      <label class="f"><span>Tarifa fixa</span><div class="campo"><span class="u">R$</span><input class="num" name="fixo${i}" value="${String(f.fixo).replace(".", ",")}"></div></label>
    </div>`).join("")}
    <div class="grid g3">
      <label class="f"><span>Item barato abaixo de</span><div class="campo"><span class="u">R$</span><input class="num" name="baratoAte" value="${String(t.baratoAte).replace(".", ",")}"></div><span class="dica">Tarifa fixa = metade do preço.</span></label>
      <label class="f"><span>Adicional CPF</span><div class="campo"><span class="u">R$</span><input class="num" name="extraCpf" value="${String(t.extraCpf).replace(".", ",")}"></div><span class="dica">Por item, acima de 450 pedidos.</span></label>
      <label class="f"><span>Revisado em</span><input name="revisado" value="${esc(t.revisado || "")}" placeholder="2026-10"></label>
    </div>
    <p class="dica">Valores da Central do Vendedor em out/2026. Comissão só incide sobre o produto, não sobre o frete. Pedido cancelado ou devolvido não paga comissão.</p>
    <div class="row" style="margin-top:14px;gap:8px"><button class="tb pri" data-sh-salvar-taxas>Salvar taxas</button><button class="tb dir" data-sh-taxas-padrao>Voltar ao padrão</button></div>
  </div></div></div>`;
  document.body.style.overflow = "hidden";
}

/* ---------- venda (vira pedido Pago) ---------- */
function shJanelaVenda(it){
  document.getElementById("modal").innerHTML = `
  <div class="ov" data-fechar><div class="md est" style="max-width:480px"><div class="pn" id="sh-vd" data-id="${it.id}">
    <div class="md-h"><h2>Registrar venda</h2><button class="x" data-fechar aria-label="Fechar">&times;</button></div>
    <p class="p13 muted" style="margin:0 0 12px">${esc(it.nome)} · vira um pedido <b>Pago</b> com origem Shopee e entra no Financeiro já sem as taxas.</p>
    <div class="grid g3">
      <label class="f"><span>Quantidade</span><input class="num" name="qtd" inputmode="numeric" value="1"></label>
      <label class="f"><span>Preço de cada</span><div class="campo"><span class="u">R$</span><input class="num" name="preco" inputmode="decimal" value="${String(num(it.preco)).replace(".", ",")}"></div></label>
      <label class="f"><span>Data</span><input type="date" name="data" value="${hoje()}"></label>
    </div>
    <label class="f" style="margin-top:8px"><span>Número do pedido na Shopee (opcional)</span><input name="ref" placeholder="2611034ABCDE"></label>
    <label class="chk" style="margin-top:10px"><input type="checkbox" name="doEstoque" ${num(it.estoquePronto) > 0 ? "checked" : ""}> Saiu das peças prontas em estoque (${num(it.estoquePronto)})</label>
    <div class="row" style="margin-top:14px"><button class="tb pri" data-sh-confirmar-venda>Registrar</button></div>
  </div></div></div>`;
  document.body.style.overflow = "hidden";
}
async function shRegistrarVenda(btn){
  const box = document.getElementById("sh-vd"), it = SH.itens.find(x => x.id === box.dataset.id), v = lerCampos(box);
  const qtd = Math.max(1, Math.round(num(v.qtd))), preco = num(v.preco);
  if(!(preco > 0)){ toast("Informe o preço da venda."); return; }
  const k = shCalc({ ...it, preco }), tx = shTaxa(preco);
  const pronta = v.doEstoque && num(it.estoquePronto) > 0;
  const p = {
    status: "pago", cliente: "Shopee" + (v.ref ? ` · ${String(v.ref).trim()}` : ""), contato: "", origem: "shopee", shopeeItemId: it.id, shopeeRef: String(v.ref || "").trim(),
    peca: it.nome, qtd, precoUn: preco, precoManual: preco, desconto: 0, entrega: 0, total: Math.round(preco * qtd * 100) / 100,
    peso: it.peso, horas: it.horas, minutos: it.minutos, acabamento: it.acabamento, extras: it.extras, filamentoId: pronta ? "" : it.filamentoId,
    custoTotal: Math.round((k.c.custo + k.frete) * qtd * 100) / 100, lucroTotal: Math.round(k.lucro * qtd * 100) / 100,
    horasTotal: pronta ? 0 : k.c.horas * qtd, filamentoTotal: num(it.peso) * qtd,
    valorRecebido: Math.round(preco * qtd * 100) / 100, taxaRecebimento: Math.round(tx.total * qtd * 100) / 100,
    formaPagamento: "Shopee", dataOrcamento: v.data || hoje(), dataPago: v.data || hoje(), prazo: "",
    obs: pronta ? "Saiu do estoque de peças prontas." : ""
  };
  btn.disabled = true; btn.textContent = "Registrando…";
  try{
    const salvo = await gravarPedido(p);
    dados.pedidos.unshift(salvo);
    await shGravar({ ...it, vendidas: num(it.vendidas) + qtd, estoquePronto: pronta ? Math.max(0, num(it.estoquePronto) - qtd) : num(it.estoquePronto) });
    fecharModal(true); render(); toast(`Venda registrada: pedido ${numPed(salvo.numero)}.`);
  }catch(e){ btn.disabled = false; btn.textContent = "Registrar"; falhou(e, "registrar a venda"); }
}

/* ---------- peças de Natal prontas ---------- */
const SH_TITULOS_NATAL = {
  "placa-feliz-natal": "Placa Feliz Natal Decorativa Impressa em 3D Enfeite de Mesa Floco de Neve Decoração Natalina Presente",
  "papai-noel-trico": "Papai Noel Tricô Boneco Decorativo Impresso em 3D Enfeite de Natal Colecionável Mesa Presente Natalino",
  "duo-de-pinheiros": "Kit 2 Pinheiros Árvore de Natal Decorativa Impressa em 3D Estilo Nórdico Enfeite Mesa Estante Natalino",
  "rena-trico": "Rena Tricô Boneco Decorativo Impresso em 3D Enfeite de Natal Colecionável Nariz Vermelho Presente",
  "ursinho-polar": "Ursinho Polar com Gorro de Noel Tricô Impresso em 3D Enfeite de Natal Colecionável Presente Natalino",
  "pinguim-noel": "Pinguim Noel Tricô Boneco Decorativo Impresso em 3D Enfeite de Natal Colecionável Mesa Presente",
  "arvore-trico": "Árvore de Natal Tricô Mini Decorativa Impressa em 3D Estrela Dourada Enfeite de Mesa Escrivaninha",
  "biscoito-de-gengibre": "Boneco Biscoito de Gengibre Tricô Impresso em 3D Enfeite de Natal Colecionável Decoração Presente"
};
async function shTrazerNatal(btn){
  if(!confirm("Criar as 8 peças de Natal na aba Shopee, já com título, descrição e preço? Depois você completa peso, tempo e fotos.")) return;
  btn.disabled = true; btn.textContent = "Criando…";
  try{
    let n = 1;
    for(const [nome, cat, , preco, slug, desc] of NATAL){
      const it = { ...SH_ZERO(), nome, categoria: cat, etapa: "fotos", preco: num(preco), sku: `RZL-NAT-${String(n++).padStart(2, "0")}`,
        titulo: SH_TITULOS_NATAL[slug] || nome, variacoes: "Cores sob encomenda", palavras: "enfeite de natal, decoração natalina, impressão 3d, presente de natal, amigo secreto",
        notas: "Fotos 1:1 para a Shopee: pacote RazenLab-anuncios-shopee-natal." };
      it.descricao = desc + "\n\n" + shDescricaoModelo(it);
      await shGravar(it);
    }
    render(); toast("8 peças de Natal criadas.");
  }catch(e){ btn.disabled = false; btn.textContent = "Trazer as 8 peças de Natal já prontas"; falhou(e, "criar as peças"); }
}

/* ---------- eventos ---------- */
let shFotoAlvo = null;
const shArq = document.createElement("input");
shArq.type = "file"; shArq.accept = "image/*"; shArq.multiple = true; shArq.style.display = "none"; shArq.id = "sh-arq";
document.body.appendChild(shArq);
shArq.addEventListener("change", async () => {
  if(!shAberto || !shArq.files.length) return;
  shLer();
  for(const f of [...shArq.files].slice(0, 9 - shAberto.fotos.length)){
    try{ shAberto.fotos.push(await comprimirFoto(f, 1600, .88)); }catch(e){ toast("Uma imagem não abriu."); }
  }
  shArq.value = ""; shDesenhar();
});

document.addEventListener("click", async e => {
  const t = e.target, el = s => t.closest(s);
  let b;
  if(t.hasAttribute && t.hasAttribute("data-fechar")){ shAberto = null; return; }
  if((b = el("[data-sh-filtro]"))){ SH.filtro = b.dataset.shFiltro; render(); return; }
  if(el("[data-sh-recarregar]")){ SH.itens = null; SH.erro = ""; render(); return; }
  if(el("[data-sh-novo]")){ shAbrir(null); return; }
  if((b = el("[data-sh-abrir]"))){ shAbrir(SH.itens.find(x => x.id === b.dataset.shAbrir)); return; }
  if(el("[data-sh-taxas]")){ shJanelaTaxas(); return; }
  if((b = el("[data-sh-natal]"))){ shTrazerNatal(b); return; }
  if((b = el("[data-sh-avancar]"))){
    const it = SH.itens.find(x => x.id === b.dataset.shAvancar), i = SH_ETAPAS.findIndex(x => x[0] === it.etapa);
    b.disabled = true;
    try{ await shGravar({ ...it, etapa: SH_ETAPAS[Math.min(i + 1, 5)][0] }); render(); }catch(err){ b.disabled = false; falhou(err, "mudar a etapa"); }
    return;
  }
  if((b = el("[data-sh-venda]"))){ const it = SH.itens.find(x => x.id === b.dataset.shVenda); if(it) shJanelaVenda(it); return; }
  if((b = el("[data-sh-confirmar-venda]"))){ shRegistrarVenda(b); return; }
  if(!shAberto && !document.getElementById("sh-tx")) return;

  if(el("[data-sh-addfoto]")){ shLer(); shArq.click(); return; }
  if((b = el("[data-sh-delfoto]"))){ shLer(); shAberto.fotos.splice(+b.dataset.shDelfoto, 1); shDesenhar(); return; }
  if((b = el("[data-sh-capa]"))){ shLer(); const [f] = shAberto.fotos.splice(+b.dataset.shCapa, 1); shAberto.fotos.unshift(f); shDesenhar(); return; }
  if(el("[data-sh-usar-sugerido]")){
    shLer(); const k = shCalc(shAberto);
    const i = document.querySelector('#sh-form [name="preco"]'); if(i) i.value = String(k.sugerido).replace(".", ",");
    shAtualizarLado(); return;
  }
  if(el("[data-sh-modelo-desc]")){
    shLer();
    if(String(shAberto.descricao || "").trim() && !confirm("Trocar a descrição atual pelo modelo?")) return;
    const d = document.querySelector('#sh-form [name="descricao"]'); if(d){ d.value = shDescricaoModelo(shAberto); shAtualizarLado(); }
    return;
  }
  if((b = el("[data-sh-copiar]"))){
    shLer(); const txt = String(shAberto[b.dataset.shCopiar] || "");
    if(!txt){ toast("Nada para copiar ainda."); return; }
    try{ await navigator.clipboard.writeText(txt); toast("Copiado. Cole na Central do Vendedor."); }catch(err){ prompt("Copie:", txt); }
    return;
  }
  if((b = el("[data-sh-salvar]"))){
    shLer();
    if(!String(shAberto.nome || "").trim()){ toast("Dê um nome à peça."); return; }
    ["peso","horas","minutos","acabamento","extras","preco","freteVendedor","margemAlvo","pesoEmb","dimC","dimL","dimA","estoquePronto"].forEach(k => { shAberto[k] = shAberto[k] === "" ? "" : num(shAberto[k]); });
    b.disabled = true; b.textContent = "Salvando…";
    try{ await shGravar(shAberto); shAberto = null; fecharModal(true); render(); toast("Item salvo."); }
    catch(err){ b.disabled = false; b.textContent = "Salvar"; falhou(err, "salvar o item"); }
    return;
  }
  if(el("[data-sh-excluir]")){
    if(!confirm(`Excluir "${shAberto.nome}" da aba Shopee? Vendas já registradas continuam nos pedidos.`)) return;
    const r = await sb.from("shopee_itens").delete().eq("id", shAberto.id);
    if(r.error){ falhou(r.error, "excluir o item"); return; }
    SH.itens = SH.itens.filter(x => x.id !== shAberto.id); shAberto = null; fecharModal(true); render();
    return;
  }
  if(el("[data-sh-taxas-padrao]")){
    if(!confirm("Voltar para a tabela padrão de taxas (out/2026)?")) return;
    delete dados.negocio.shopeeTaxas;
    try{ await gravarConfig(); fecharModal(true); render(); toast("Tabela padrão restaurada."); }catch(err){ falhou(err, "salvar as taxas"); }
    return;
  }
  if((b = el("[data-sh-salvar-taxas]"))){
    const v = lerCampos(document.getElementById("sh-tx")), velho = shTabela();
    const faixas = velho.faixas.map((f, i) => ({ ate: i === velho.faixas.length - 1 ? null : num(v["ate" + i]), pct: num(v["pct" + i]), fixo: num(v["fixo" + i]) }));
    for(let i = 1; i < faixas.length - 1; i++) if(faixas[i].ate <= faixas[i - 1].ate){ toast("As faixas precisam estar em ordem crescente."); return; }
    const antes = { t: dados.negocio.shopeeTaxas, c: dados.negocio.shopeeConta };
    dados.negocio.shopeeTaxas = { faixas, baratoAte: num(v.baratoAte), extraCpf: num(v.extraCpf), revisado: String(v.revisado || "").trim() };
    dados.negocio.shopeeConta = v.conta;
    try{ await gravarConfig(); fecharModal(true); render(); toast("Taxas salvas."); }
    catch(err){ dados.negocio.shopeeTaxas = antes.t; dados.negocio.shopeeConta = antes.c; falhou(err, "salvar as taxas"); }
  }
});
document.addEventListener("input", e => { if(shAberto && e.target.closest("#sh-form")) shAtualizarLado(); });
// texto já atualiza no "input"; o "change" só serve para lista e caixinha (redesenhar no blur engoliria o clique)
document.addEventListener("change", e => { if(shAberto && e.target.closest("#sh-form") && (e.target.tagName === "SELECT" || e.target.type === "checkbox")) shAtualizarLado(); });
