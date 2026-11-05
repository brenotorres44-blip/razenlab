/* ==========================================================================
   RAZENLAB · painel · ETIQUETA DE ENVIO (impressora térmica 10 × 15 cm)
   Botão "Imprimir etiqueta" na janela do pedido. Abre a etiqueta pronta e
   chama a impressão: escolha a impressora térmica, tamanho 100 × 150 mm,
   margens "nenhuma", escala 100%.
   Tudo em preto puro (térmica não imprime cor). Código de barras Code 128
   com o número do pedido e QR Code com o link de acompanhamento.
   ========================================================================== */
"use strict";

/* ---------- Code 128 (conjunto B) em SVG ---------- */
const C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
function code128svg(texto, alturaMm){
  const s = String(texto).replace(/[^\x20-\x7E]/g, "");
  const cod = [104];                                   // Start B
  for(const ch of s) cod.push(ch.charCodeAt(0) - 32);
  let soma = 104; for(let i = 1; i < cod.length; i++) soma += cod[i] * i;
  cod.push(soma % 103, 106);                           // verificador + Stop
  let x = 10, barras = "";                             // 10 módulos de margem
  for(const c of cod){
    const p = C128[c];
    for(let i = 0; i < p.length; i++){ const w = +p[i]; if(i % 2 === 0) barras += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w; }
  }
  x += 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 40" preserveAspectRatio="none" style="width:100%;height:${alturaMm}mm;display:block" shape-rendering="crispEdges">${barras}</svg>`;
}
function qrSvg(texto){
  try{ const q = qrcode(0, "M"); q.addData(texto); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); }
  catch(e){ return ""; }
}

/* ---------- etiqueta ---------- */
function etiquetaHTML(p){
  const n = dados.negocio, e = p.endereco || {};
  const ab = s => esc(String(s || "").trim());
  const cep = c => { const d = String(c || "").replace(/\D/g, ""); return d.length === 8 ? d.slice(0, 5) + "-" + d.slice(5) : esc(c || ""); };
  const tel = t => {
    const d = String(t || "").replace(/\D/g, ""); if(d.length < 10) return esc(t || "");
    const c = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;   // tira o +55
    return `(${c.slice(0, 2)}) ${c.slice(2, -4)}-${c.slice(-4)}`;
  };
  const nome = String(p.cliente || "Cliente").replace(/^\[TESTE\]\s*/, "");
  const retirada = !e.rua;
  const itens = Array.isArray(p.itens) && p.itens.length ? p.itens.map(i => ({ q: num(i.qtd), t: i.titulo, c: i.cor })) : [{ q: num(p.qtd) || 1, t: p.peca || "Peça impressa em 3D", c: "" }];
  const mostrar = itens.slice(0, 6), resto = itens.length - mostrar.length;
  const unid = itens.reduce((s, i) => s + i.q, 0);
  const pesoG = (Array.isArray(p.itens) ? p.itens.reduce((s, i) => s + num(i.pesoG) * num(i.qtd), 0) : 0) || num(p.filamentoTotal) || 0;
  const numero = "#" + String(p.numero || 0).padStart(4, "0");
  const link = p.token ? new URL(`pedido.html?t=${p.token}`, location.href).href : "";
  const logo = etqLogo || new URL("assets/marca/logo-termica.png", location.href).href;
  const data = new Date().toLocaleDateString("pt-BR");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ${numero} · RazenLab</title>
<style>
@page{size:100mm 150mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.et{width:100mm;height:150mm;padding:3mm;display:flex;flex-direction:column;gap:1.6mm;overflow:hidden}
.topo{display:flex;align-items:center;gap:3mm;border-bottom:.6mm solid #000;padding-bottom:1.8mm}
.topo img{height:19mm;width:auto}
.marca{flex:1;line-height:1.15}
.marca b{font-size:13pt;letter-spacing:.3pt}
.marca small{display:block;font-size:7pt;line-height:1.3}
.ped{text-align:right;line-height:1.1}
.ped b{display:block;font-size:17pt}
.ped small{font-size:7pt}
.cb{padding:0 2mm}
.cb .t{text-align:center;font:bold 8pt monospace;letter-spacing:1.5pt;margin-top:.6mm}
.bx{border:.4mm solid #000;border-radius:1.2mm;padding:1.8mm 2.4mm}
.rt{font-size:6.5pt;font-weight:bold;letter-spacing:.8pt;margin-bottom:.8mm}
.dest .nm{font-size:13pt;font-weight:bold;line-height:1.15}
.dest .en{font-size:9.5pt;line-height:1.3;margin-top:.6mm}
.dest .cep{font-size:15pt;font-weight:bold;margin-top:1mm;letter-spacing:.5pt}
.dest .tel{font-size:9pt;margin-top:.4mm}
.rem{font-size:7.5pt;line-height:1.3}
.itens{font-size:8.5pt;line-height:1.35;flex:1;overflow:hidden}
.itens li{list-style:none;display:flex;gap:1.5mm}
.itens li b{min-width:7mm}
.rod{display:flex;gap:2.5mm;align-items:flex-end;border-top:.4mm dashed #000;padding-top:1.6mm}
.rod .qr{width:19mm;height:19mm;flex:none}
.rod .qr svg{width:100%;height:100%}
.rod .inf{flex:1;font-size:7.5pt;line-height:1.35}
.rod .inf b{font-size:8.5pt}
.ret{font-size:12pt;font-weight:bold;text-align:center;border:.6mm solid #000;padding:2mm;margin-top:1mm}
@media screen{body{background:#666;padding:10px}.et{background:#fff;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.4)}}
</style></head><body>
<div class="et">
  <div class="topo">
    <img src="${logo}" alt="RazenLab">
    <div class="marca"><small>Transformando ideias em realidade, camada por camada.</small><small style="margin-top:1mm;font-weight:bold">razenlab.com.br · @razenlab3d</small></div>
    <div class="ped"><small>PEDIDO</small><b>${numero}</b><small>${data}</small></div>
  </div>
  <div class="cb">${code128svg("RZL" + String(p.numero || 0).padStart(6, "0"), 11)}<div class="t">RZL${String(p.numero || 0).padStart(6, "0")}</div></div>
  <div class="bx dest">
    <div class="rt">DESTINATÁRIO</div>
    <div class="nm">${ab(nome)}</div>
    ${retirada ? `<div class="ret">RETIRADA EM MÃOS</div>` : `
    <div class="en">${ab(e.rua)}, ${ab(e.numero)}${e.complemento ? ` · ${ab(e.complemento)}` : ""}<br>${ab(e.bairro)}${e.bairro ? " · " : ""}${ab(e.cidade)}${e.uf ? "/" + ab(e.uf) : ""}</div>
    <div class="cep">CEP ${cep(p.cep)}</div>`}
    ${p.contato ? `<div class="tel">Tel.: ${tel(p.contato)}</div>` : ""}
  </div>
  <div class="bx rem">
    <div class="rt">REMETENTE</div>
    <b>${ab(n.nome || "RazenLab")}${n.nome && !/razen/i.test(n.nome) ? " · RazenLab" : ""}</b><br>
    ${n.remEndereco ? ab(n.remEndereco) + "<br>" : ""}${ab(n.cidade)}${n.cepOrigem ? ` · CEP ${cep(n.cepOrigem)}` : ""}${n.whatsapp ? ` · ${tel(n.whatsapp)}` : ""}
  </div>
  <div class="bx itens">
    <div class="rt">CONTEÚDO · ${unid} ${unid === 1 ? "PEÇA" : "PEÇAS"}</div>
    <ul>${mostrar.map(i => `<li><b>${i.q}×</b><span>${ab(i.t)}${i.c ? ` (${ab(i.c)})` : ""}</span></li>`).join("")}${resto > 0 ? `<li><b></b><span>+ ${resto} item(ns)</span></li>` : ""}</ul>
  </div>
  <div class="rod">
    ${link ? `<div class="qr">${qrSvg(link)}</div>` : ""}
    <div class="inf">
      <b>${ab(p.freteServico || (retirada ? "Retirada em mãos" : "Envio"))}</b><br>
      ${p.rastreio ? `Rastreio: <b>${ab(p.rastreio)}</b><br>` : ""}
      ${pesoG ? `Peso aprox.: ${dec(pesoG / 1000, 2)} kg<br>` : ""}
      ${link ? "Acompanhe o pedido pelo QR Code." : ""}<br>
      Obrigado por comprar com a RazenLab!
    </div>
  </div>
</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)});</script>
</body></html>`;
}

/* o logo vai embutido na etiqueta (data URL): imprime certo mesmo se a janela nova não carregar arquivos */
let etqLogo = "";
async function carregarLogoEtiqueta(){
  if(etqLogo) return;
  try{
    const b = await (await fetch("assets/marca/logo-termica.png")).blob();
    etqLogo = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  }catch(e){}
}
async function imprimirEtiqueta(p){
  if(!p || !p.id){ toast("Salve o pedido antes de imprimir a etiqueta."); return; }
  const e = p.endereco || {};
  if(!e.rua && !/retir/i.test(p.freteServico || "") && !confirm("Este pedido não tem endereço de entrega. Imprimir como retirada em mãos?")) return;
  const w = window.open("", "_blank", "width=480,height=720");   // abre já no clique (senão o navegador bloqueia)
  if(!w){ toast("O navegador bloqueou a janela da etiqueta. Libere pop-ups para o painel."); return; }
  await carregarLogoEtiqueta();
  w.document.open(); w.document.write(etiquetaHTML(p)); w.document.close();
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-acao=\"imprimir-etiqueta\"]");
  if(!b) return;
  e.stopPropagation();
  const p = (typeof pedidoAberto !== "undefined" && pedidoAberto && pedidoAberto.id === b.dataset.id) ? pedidoAberto : dados.pedidos.find(x => x.id === b.dataset.id);
  imprimirEtiqueta(p);
}, true);
