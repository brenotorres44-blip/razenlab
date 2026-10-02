// ==========================================================================
//  RAZENLAB · função "makerworld"
//  Recebe o link de um modelo do MakerWorld e devolve, de forma organizada:
//  título, autor, capa, licença (se permite vender as impressões) e os perfis
//  de impressão com tempo, peso, placas e filamentos.
//  Só funciona para quem está logado como administrador do painel.
//  Não precisa de nenhum segredo.
// ==========================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// licenças do MakerWorld: quais deixam vender as impressões
function avaliarLicenca(lic: string): { permiteVenda: boolean | null; nome: string } {
  const l = (lic || "").toUpperCase().replace(/^CC[\s-]*/, "");
  if (!l) return { permiteVenda: null, nome: "Não informada" };
  if (l.includes("STANDARD DIGITAL FILE")) return { permiteVenda: false, nome: "Standard Digital File License" };
  if (/\bNC\b/.test(l)) return { permiteVenda: false, nome: `Creative Commons ${l}` };
  if (l === "CC0" || l === "0" || l.includes("PUBLIC DOMAIN")) return { permiteVenda: true, nome: "Domínio público (CC0)" };
  if (/^BY(-SA|-ND)?$/.test(l)) return { permiteVenda: true, nome: `Creative Commons ${l}` };
  return { permiteVenda: null, nome: lic };
}

type Fil = { type?: string; color?: string; usedG?: string | number };
type Inst = {
  id: number; profileId?: number; title?: string; titleTranslated?: string; isDefault?: boolean;
  prediction?: number; weight?: number; materialCnt?: number; needAms?: boolean; cover?: string;
  ratingCount?: number; printCount?: number; instanceFilaments?: Fil[];
  extention?: { modelInfo?: { plates?: unknown[]; compatibility?: { devProductName?: string; nozzleDiameter?: number };
    projectSettings?: { layerHeight?: string; wallLoops?: string; sparseInfillDensity?: string } } };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Use POST." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const BASES = (Deno.env.get("MAKERWORLD_BASES") ?? "https://makerworld.com/api/v1,https://api.bambulab.com/v1").split(",");

  // só o administrador (evita que a função vire um atalho aberto para outros sites)
  const adm = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: "POST", headers: { apikey: ANON, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" }, body: "{}",
  }).catch(() => null);
  if (!adm || !adm.ok || (await adm.json().catch(() => false)) !== true) return resposta({ erro: "Acesso negado. Entre no painel de novo." }, 401);

  let b: { url?: string };
  try { b = await req.json(); } catch { return resposta({ erro: "Dados inválidos." }, 400); }
  const link = String(b.url ?? "").trim();
  const mModelo = link.match(/makerworld\.com(?:\.cn)?\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?models\/(\d{1,12})/i);
  if (!mModelo) return resposta({ erro: "Cole o link de um modelo do MakerWorld (makerworld.com/…/models/…)." }, 400);
  const designId = mModelo[1];
  const perfilPedido = Number((link.match(/profileId-(\d+)/i) || [])[1] || 0);

  // busca os dados do modelo (tenta mais de um endereço)
  let d: Record<string, unknown> | null = null, ultimoStatus = 0;
  for (const base of BASES) {
    const r = await fetch(`${base.trim()}/design-service/design/${designId}`, {
      headers: { Accept: "application/json", "User-Agent": "RazenLab/1.0 (orcamento de impressao 3D)" },
    }).catch(() => null);
    if (!r) continue;
    ultimoStatus = r.status;
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) { d = await r.json().catch(() => null); if (d && d.id) break; }
  }
  if (!d) {
    return resposta({ erro: ultimoStatus === 404 ? "Modelo não encontrado no MakerWorld." : "O MakerWorld não respondeu agora. Tente de novo em instantes." }, 502);
  }

  const lic = avaliarLicenca(String(d.license ?? ""));
  const descLic = (d.licenseDescriptionInfo as { content?: string } | undefined)?.content ?? "";
  const instancias = (Array.isArray(d.instances) ? d.instances : []) as Inst[];
  const perfis = instancias.map((i) => {
    const mi = i.extention?.modelInfo ?? {};
    const ps = mi.projectSettings ?? {};
    return {
      id: i.id,
      titulo: String(i.titleTranslated || i.title || "Perfil"),
      padrao: !!i.isDefault || i.id === d!.defaultInstanceId,
      escolhidoNoLink: perfilPedido > 0 && (i.id === perfilPedido || i.profileId === perfilPedido),
      impressora: mi.compatibility?.devProductName ?? "",
      bico: mi.compatibility?.nozzleDiameter ?? null,
      tempoMin: Math.round(Number(i.prediction ?? 0) / 60),
      pesoG: Math.round(Number(i.weight ?? 0) * 10) / 10,
      placas: Array.isArray(mi.plates) ? mi.plates.length : null,
      cores: Number(i.materialCnt ?? 0),
      precisaAms: !!i.needAms,
      filamentos: (i.instanceFilaments ?? []).map((f) => ({ tipo: f.type ?? "", cor: f.color ?? "", g: Number(f.usedG ?? 0) })),
      camada: ps.layerHeight || "", paredes: ps.wallLoops || "", preenchimento: ps.sparseInfillDensity || "",
      avaliacoes: Number(i.ratingCount ?? 0), impressoes: Number(i.printCount ?? 0),
      capa: i.cover ?? "",
    };
  }).filter((p) => p.tempoMin > 0 || p.pesoG > 0);

  return resposta({
    id: Number(d.id),
    titulo: String(d.titleTranslated || d.title || ""),
    autor: (d.designCreator as { name?: string } | undefined)?.name ?? "",
    capa: String(d.coverUrl ?? ""),
    link: `https://makerworld.com/pt/models/${d.id}`,
    licenca: lic.nome,
    licencaCodigo: String(d.license ?? ""),
    permiteVenda: lic.permiteVenda,
    licencaTexto: descLic.slice(0, 600),
    perfis,
  });
});
