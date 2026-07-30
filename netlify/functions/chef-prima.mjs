// Chef Prima — cérebro de IA (Netlify Function v2)
// Migrado do Supabase (CHEFPRIMAIA) a 18/07/2026 após a perda da conta Console da Anthropic:
// usa o AI Gateway da Netlify (injeta ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL, fatura na conta Netlify).
// O SYSTEM_PROMPT continua REMOTO em /prima-prompt.txt — git push = atualizar o cérebro (cache 5 min).

const PROMPT_URL = "https://massaprima.com/prima-prompt.txt";
const PROMPT_TTL_MS = 5 * 60 * 1000;

const FALLBACK_PROMPT = `És o Chef Prima 🌾, o mestre padeiro digital da Massa Prima — marca angolana de matérias-primas de panificação e pastelaria da Quente e Bom (Viana, Luanda), em grande parte produzida em Angola. Tom caloroso, técnico-acessível, PT com naturalidade angolana, respostas curtas. Ensinas a usar os mixes, receitas e food cost (ideal 25-35% do preço de venda). NUNCA digas preços nem menciones parceiros de produção. Contacto: geral@quenteebom.co.ao. Receitas: https://massaprima.com/receitas.html · Catálogo: https://massaprima.com/catalogo.html · Food cost: https://massaprima.com/foodcost.html`;

let promptCache = { text: "", ts: 0 };

async function getPrompt() {
  const now = Date.now();
  if (promptCache.text && now - promptCache.ts < PROMPT_TTL_MS) return promptCache.text;
  try {
    const r = await fetch(PROMPT_URL, { headers: { "cache-control": "no-cache" } });
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.length > 200) {
        promptCache = { text: t, ts: now };
        return t;
      }
    }
  } catch { /* usa fallback */ }
  return promptCache.text || FALLBACK_PROMPT;
}

// Modo de contingência: quando a IA não está disponível, o Chef Prima responde
// com os encaminhamentos essenciais em vez de um erro.
const CONTINGENCIA =
  "Olá! 🌾 Estou numa pausa rápida, mas ajudo já: receitas com doses oficiais em massaprima.com/receitas.html • catálogo completo em massaprima.com/catalogo.html • preços e encomendas: pedido de cotação em massaprima.com/cotacao.html ou geral@quenteebom.co.ao. Volto num instante!";

// Só aceitamos pedidos vindos do próprio site (regras de uso da Anthropic:
// o endpoint público não pode servir de API aberta a terceiros).
const ORIGENS = ["https://massaprima.com", "https://www.massaprima.com", "https://massaprima.netlify.app", "http://localhost"];
const origemValida = (req) => {
  const o = req.headers.get("origin") || req.headers.get("referer") || "";
  return ORIGENS.some((p) => o.startsWith(p));
};

// Proteção anti-abuso: limite por IP (janela deslizante) + teto diário global.
// Em memória por instância — best-effort, suficiente para travar floods e bots.
const IP_LIMITE = 8;            // pedidos por IP
const IP_JANELA_MS = 60_000;    // por minuto
const DIA_LIMITE = 400;         // teto de pedidos por instância e por dia
const baldeIp = new Map();
let diaTotal = 0;
let diaInicio = 0;

function excedeuLimites(ip) {
  const agora = Date.now();
  if (agora - diaInicio > 86_400_000) { diaInicio = agora; diaTotal = 0; }
  if (++diaTotal > DIA_LIMITE) return true;
  const recentes = (baldeIp.get(ip) ?? []).filter((t) => agora - t < IP_JANELA_MS);
  recentes.push(agora);
  baldeIp.set(ip, recentes);
  if (baldeIp.size > 5000) baldeIp.clear(); // trava crescimento de memória
  return recentes.length > IP_LIMITE;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// PLANO B: se o Claude falhar (erro/429), tenta o Gemini — pelo MESMO gateway da
// Netlify (GEMINI_API_KEY + GOOGLE_GEMINI_BASE_URL injetados; sem chaves pessoais).
async function planoBGemini(system, mensagens, maxTokens) {
  const chave = process.env.GEMINI_API_KEY;
  const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const modelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!chave || !base) return null;
  const corpo = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: mensagens.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : "" }],
    })),
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const pedir = () => fetch(`${base}/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: corpo,
  });
  try {
    let r = await pedir();
    // rajadas de 429/5xx do gateway são curtas — uma segunda tentativa resolve quase sempre.
    if (!r.ok && (r.status === 429 || r.status >= 500)) {
      console.error("chef-prima: Gemini", r.status, "→ retry em 1.2s");
      await new Promise((res) => setTimeout(res, 1200));
      r = await pedir();
    }
    if (!r.ok) { console.error("chef-prima: Gemini", r.status, (await r.text()).slice(0, 200)); return null; }
    const j = await r.json();
    const texto = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return texto || null;
  } catch (e) {
    console.error("chef-prima: Gemini falha de rede", e);
    return null;
  }
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!origemValida(req)) return json({ error: "origem" }, 403);

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "?";
  if (excedeuLimites(ip)) return json({ error: "IA indisponível" }, 429);

  // Precisa de PELO MENOS um motor: Gemini (principal) ou Anthropic (reforço opcional).
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return json({ reply: CONTINGENCIA });

  let corpo;
  try { corpo = await req.json(); } catch { return json({ error: "pedido inválido" }, 400); }

  const raw = Array.isArray(corpo?.messages) ? corpo.messages : [];
  const messages = raw.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 1000),
  })).filter((m) => m.content.trim());
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "messages em falta" }, 400);
  }

  const system = await getPrompt();
  const geminiModelo = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const geminiChave = process.env.GEMINI_API_KEY;
  const geminiBase = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  // Reforço OPCIONAL: Claude, só se existir chave Anthropic (o motor principal é o Gemini).
  async function tentarClaude() {
    const chaveA = process.env.ANTHROPIC_API_KEY;
    if (!chaveA) return null;
    const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": chaveA, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5", max_tokens: 900, system, messages }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      let reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (data.stop_reason === "max_tokens") reply = reply.replace(/\n[^\n]*$/, "").trim() || reply;
      return reply || null;
    } catch { return null; }
  }

  // Motor principal = GEMINI. Se falhar, tenta Claude (se houver chave); senão, contingência.
  async function gerarReply() {
    const g = await planoBGemini(system, messages, 900);
    if (g) return g;
    return (await tentarClaude()) || CONTINGENCIA;
  }

  // ── Streaming (aditivo) via Gemini SSE. Se não arrancar ou não sair nada, cai para
  // o caminho JSON (gerarReply) — o widget trata os dois formatos. Fallback total.
  if (corpo?.stream === true && geminiChave) {
    try {
      const r = await fetch(`${geminiBase}/v1beta/models/${geminiModelo}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": geminiChave },
        body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 900 } }),
      });
      if (r.ok && r.body) {
        const upstream = r.body.getReader();
        const dec = new TextDecoder(), enc = new TextEncoder();
        let buf = "", saiuAlgo = false;
        const stream = new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await upstream.read();
              if (done) {
                // se o stream não produziu texto, recorre ao JSON antes de fechar
                if (!saiuAlgo) { const g = await gerarReply(); controller.enqueue(enc.encode("data: " + JSON.stringify({ t: g }) + "\n\n")); }
                controller.enqueue(enc.encode('data: {"done":true}\n\n')); controller.close(); return;
              }
              buf += dec.decode(value, { stream: true });
              let idx;
              while ((idx = buf.indexOf("\n")) >= 0) {
                const linha = buf.slice(0, idx); buf = buf.slice(idx + 1);
                if (!linha.startsWith("data:")) continue;
                const p = linha.slice(5).trim();
                if (!p || p === "[DONE]") continue;
                try {
                  const ev = JSON.parse(p);
                  const t = (ev?.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
                  if (t) { saiuAlgo = true; controller.enqueue(enc.encode("data: " + JSON.stringify({ t }) + "\n\n")); }
                } catch { /* ignora keep-alive/eventos não-texto */ }
              }
            } catch (e) { console.error("chef-prima: stream Gemini", e); try { controller.close(); } catch {} }
          },
          cancel() { try { upstream.cancel(); } catch {} },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" } });
      }
      console.error("chef-prima: stream Gemini não arrancou", r.status);
    } catch (e) { console.error("chef-prima: stream Gemini falhou, uso JSON", e); }
  }

  return json({ reply: await gerarReply() });
};

export const config = { path: "/api/chef-prima" };
