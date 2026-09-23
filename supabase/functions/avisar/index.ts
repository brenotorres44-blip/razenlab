// ==========================================================================
//  RAZENLAB · função "avisar"
//  Manda uma mensagem no seu Telegram quando chega um pedido pelo site
//  ou quando o cliente envia o comprovante do Pix.
//  Cada acontecimento avisa uma vez só, mesmo que alguém chame de novo.
//
//  Segredos necessários (Supabase → Edge Functions → Secrets):
//    TELEGRAM_BOT_TOKEN   token que o @BotFather entrega
//    TELEGRAM_CHAT_ID     o número da sua conversa com o robô
//  Opcional:
//    PAINEL_URL           endereço do seu painel, para vir um link na mensagem
// ==========================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const html = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => "#" + String(n).padStart(4, "0");
const JANELA_MS = 15 * 60 * 1000; // só avisa acontecimentos dos últimos 15 minutos

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const CHAT = Deno.env.get("TELEGRAM_CHAT_ID");
  const TG = Deno.env.get("TELEGRAM_API_BASE") ?? "https://api.telegram.org";
  const PAINEL = Deno.env.get("PAINEL_URL") ?? "";
  if (!BOT || !CHAT) return resposta({ ok: false, motivo: "Telegram não configurado." });

  let b: { token?: string; evento?: string };
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(b.token ?? "") || !["novo", "comprovante"].includes(b.evento ?? "")) {
    return resposta({ erro: "Dados inválidos." }, 400);
  }

  const cab = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?token=eq.${b.token}&select=id,numero,status,cliente,dados,criado_em`, { headers: cab });
  const [p] = r.ok ? await r.json() : [];
  if (!p) return resposta({ erro: "Pedido não encontrado." }, 404);
  const d = p.dados ?? {};
  const agora = Date.now();

  let texto = "", marca = "";
  if (b.evento === "novo") {
    if (p.status !== "solicitado" || d.avisadoNovo || agora - Date.parse(p.criado_em) > JANELA_MS) return resposta({ ok: false, motivo: "Nada a avisar." });
    const e = d.endereco ?? {};
    texto = [
      `🆕 <b>Novo pedido ${num(p.numero)}</b>`,
      `👤 ${html(d.cliente)} · ${html(d.contato)}`,
      e.cidade ? `📍 ${html(e.cidade)}/${html(e.uf)}` : "",
      `📝 ${html(String(d.pedidoCliente ?? "").slice(0, 400))}`,
      d.qtd ? `🔢 ${html(d.qtd)} un.${d.quando ? " · para " + html(d.quando) : ""}` : "",
      d.anexo ? "📎 Tem anexo" : "",
    ].filter(Boolean).join("\n");
    marca = "avisadoNovo";
  } else {
    const quando = Date.parse(d.comprovanteEm ?? "");
    if (p.status !== "comprovante" || !quando || agora - quando > JANELA_MS || d.avisadoComprovante === d.comprovanteEm) return resposta({ ok: false, motivo: "Nada a avisar." });
    texto = [
      `💸 <b>Comprovante recebido · ${num(p.numero)}</b>`,
      `👤 ${html(d.cliente)}`,
      `💰 ${brl(d.total)}`,
      "Confira no app do banco e confirme no painel.",
    ].join("\n");
    marca = "avisadoComprovante";
  }
  if (PAINEL) texto += `\n\n<a href="${html(PAINEL)}">Abrir o painel</a>`;

  const tg = await fetch(`${TG}/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: texto, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => null);
  if (!tg || !tg.ok) return resposta({ ok: false, motivo: "O Telegram recusou a mensagem. Confira o token e o chat." }, 502);

  // marca como avisado para não repetir
  const valor = marca === "avisadoNovo" ? true : d.comprovanteEm;
  await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${p.id}`, {
    method: "PATCH",
    headers: { ...cab, Prefer: "return=minimal" },
    body: JSON.stringify({ dados: { ...d, [marca]: valor } }),
  }).catch(() => null);

  return resposta({ ok: true });
});
