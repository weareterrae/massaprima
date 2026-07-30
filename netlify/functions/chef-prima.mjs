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
  if (!chave || !base) return null;
  try {
    const r = await fetch(`${base}/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: mensagens.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: typeof m.content === "string" ? m.content : "" }],
        })),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
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

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return json({ reply: CONTINGENCIA });

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
  const modelo = process.env.CLAUDE_MODEL || "claude-sonnet-5";
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const anthHeaders = { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" };

  // Gera a resposta completa (Claude + retry → Gemini → contingência). Mesmo comportamento de sempre.
  async function gerarReply() {
    try {
      const pedirClaude = () => fetch(`${base}/v1/messages`, {
        method: "POST", headers: anthHeaders,
        body: JSON.stringify({ model: modelo, max_tokens: 900, system, messages }),
      });
      let r = await pedirClaude();
      if (!r.ok && (r.status === 429 || r.status >= 500)) {
        console.error("chef-prima: Anthropic", r.status, "→ retry em 1.2s");
        await new Promise((res) => setTimeout(res, 1200));
        r = await pedirClaude();
      }
      if (!r.ok) {
        console.error("chef-prima: Anthropic", r.status, await r.text());
        const b = await planoBGemini(system, messages, 900);
        return b || CONTINGENCIA;
      }
      const data = await r.json();
      let reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (data.stop_reason === "max_tokens") reply = reply.replace(/\n[^\n]*$/, "").trim() || reply;
      return reply;
    } catch (e) {
      console.error("chef-prima: falha de rede", e);
      const b = await planoBGemini(system, messages, 900);
      return b || CONTINGENCIA;
    }
  }

  // ── Streaming (opcional, aditivo): o widget pede {stream:true}; se o streaming
  // não arrancar, respondemos em JSON — o widget trata os dois formatos. Caminho
  // JSON abaixo fica 100% intacto como fallback.
  if (corpo?.stream === true) {
    try {
      const r = await fetch(`${base}/v1/messages`, {
        method: "POST", headers: anthHeaders,
        body: JSON.stringify({ model: modelo, max_tokens: 900, system, messages, stream: true }),
      });
      if (r.ok && r.body) {
        const upstream = r.body.getReader();
        const dec = new TextDecoder(), enc = new TextEncoder();
        const stream = new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await upstream.read();
              if (done) { controller.enqueue(enc.encode('data: {"done":true}\n\n')); controller.close(); return; }
              // reencaminha só os deltas de texto do formato SSE da Anthropic
              for (const linha of dec.decode(value, { stream: true }).split("\n")) {
                if (!linha.startsWith("data:")) continue;
                const p = linha.slice(5).trim();
                if (!p || p === "[DONE]") continue;
                try {
                  const ev = JSON.parse(p);
                  const t = ev?.delta?.text;
                  if (ev.type === "content_block_delta" && typeof t === "string" && t)
                    controller.enqueue(enc.encode("data: " + JSON.stringify({ t }) + "\n\n"));
                } catch { /* ignora keep-alive/eventos não-texto */ }
              }
            } catch (e) { console.error("chef-prima: stream", e); try { controller.close(); } catch {} }
          },
          cancel() { try { upstream.cancel(); } catch {} },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" } });
      }
      // streaming não arrancou → cai para JSON (com retry/Gemini/contingência)
      console.error("chef-prima: stream não arrancou", r.status);
    } catch (e) { console.error("chef-prima: stream falhou, uso JSON", e); }
  }

  return json({ reply: await gerarReply() });
};

export const config = { path: "/api/chef-prima" };
