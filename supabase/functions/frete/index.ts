// ==========================================================================
//  RAZENLAB · função "frete"
//  Cota o frete no Melhor Envio (Correios, Jadlog e outras).
//  Só funciona para quem está logado como administrador do painel.
//
//  Segredos necessários (Supabase → Edge Functions → Secrets):
//    MELHOR_ENVIO_TOKEN   token pessoal gerado na sua conta do Melhor Envio
//    MELHOR_ENVIO_EMAIL   seu e-mail (o Melhor Envio pede para identificar quem chama)
//  Opcional:
//    MELHOR_ENVIO_SANDBOX = 1  para testar no ambiente de testes deles
// ==========================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const limitar = (v: unknown, min: number, max: number, padrao: number) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.min(max, Math.max(min, x)) : padrao;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const TOKEN = Deno.env.get("MELHOR_ENVIO_TOKEN");
  const EMAIL = Deno.env.get("MELHOR_ENVIO_EMAIL") ?? "contato@razenlab.com.br";
  const BASE = Deno.env.get("MELHOR_ENVIO_BASE") ??
    (Deno.env.get("MELHOR_ENVIO_SANDBOX") === "1" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br");

  if (!TOKEN) return resposta({ erro: "Falta cadastrar o segredo MELHOR_ENVIO_TOKEN no Supabase." }, 500);

  // 1) confere se quem chamou é administrador (usa a própria regra do banco)
  const auth = req.headers.get("Authorization") ?? "";
  const adm = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => null);
  if (!adm || !adm.ok || (await adm.json().catch(() => false)) !== true) {
    return resposta({ erro: "Acesso negado. Entre no painel de novo." }, 401);
  }

  // 2) monta o pacote
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  const de = soDigitos(b.de), para = soDigitos(b.para);
  if (de.length !== 8 || para.length !== 8) return resposta({ erro: "CEP de origem e de destino precisam ter 8 dígitos." }, 400);

  const pacote = {
    weight: limitar(b.pesoKg, 0.01, 30, 0.3),   // kg
    width: limitar(b.largura, 1, 100, 15),       // cm
    height: limitar(b.altura, 1, 100, 10),       // cm
    length: limitar(b.comprimento, 1, 100, 20),  // cm
  };
  const corpo = {
    from: { postal_code: de },
    to: { postal_code: para },
    package: pacote,
    options: { insurance_value: limitar(b.valorDeclarado, 0, 10000, 0), receipt: false, own_hand: false },
  };

  // 3) pergunta ao Melhor Envio
  let r: Response;
  try {
    r = await fetch(`${BASE}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "User-Agent": `RazenLab (${EMAIL})`,
      },
      body: JSON.stringify(corpo),
    });
  } catch {
    return resposta({ erro: "Não consegui falar com o Melhor Envio. Tente de novo em instantes." }, 502);
  }
  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = r.status === 401 ? "Token do Melhor Envio inválido ou vencido. Gere outro e atualize o segredo."
      : `O Melhor Envio respondeu com erro ${r.status}.`;
    return resposta({ erro: msg, detalhe: dados?.message ?? null }, 502);
  }

  // 4) devolve só o que interessa, do mais barato para o mais caro
  const opcoes = (Array.isArray(dados) ? dados : [])
    .filter((o) => !o.error && (o.custom_price ?? o.price))
    .map((o) => ({
      id: o.id,
      servico: String(o.name ?? ""),
      empresa: String(o.company?.name ?? ""),
      preco: Number(o.custom_price ?? o.price),
      prazo: Number(o.custom_delivery_time ?? o.delivery_time) || null,
    }))
    .filter((o) => Number.isFinite(o.preco))
    .sort((a, b) => a.preco - b.preco);

  return resposta({ opcoes, pacote });
});
