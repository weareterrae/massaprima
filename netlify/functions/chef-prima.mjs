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

// Proteção anti-abuso (em memória por instância — best-effort, trava floods/bots).
const IP_MIN_LIMITE = 18;      // pedidos por IP por minuto
const IP_HORA_LIMITE = 150;    // pedidos por IP por hora
const DIA_LIMITE = 800;        // teto diário global por instância (backstop anti-runaway)
const MAX_BODY_BYTES = 40 * 1024;  // teto do corpo do pedido
const MAX_MSGS = 16;           // últimas N mensagens enviadas ao modelo
const MAX_CHARS = 1500;        // teto de caracteres por mensagem
const baldeIp = new Map();     // ip -> [timestamps da última hora]
let diaTotal = 0;
let diaInicio = 0;

// limite por IP: devolve true se excedeu minuto OU hora (→ 429 amável).
function limiteIp(ip) {
  const agora = Date.now();
  const arr = (baldeIp.get(ip) ?? []).filter((t) => agora - t < 3_600_000); // última hora
  arr.push(agora);
  baldeIp.set(ip, arr);
  if (baldeIp.size > 5000) baldeIp.clear(); // trava crescimento de memória
  const ultimoMin = arr.reduce((n, t) => n + (agora - t < 60_000 ? 1 : 0), 0);
  return ultimoMin > IP_MIN_LIMITE || arr.length > IP_HORA_LIMITE;
}
// teto diário global: devolve true quando ultrapassa (→ fallback gracioso, não erro).
function tetoDiarioExcedido() {
  const agora = Date.now();
  if (agora - diaInicio > 86_400_000) { diaInicio = agora; diaTotal = 0; }
  return (++diaTotal > DIA_LIMITE);
}

// Mensagem amável de rate-limit (sem WhatsApp — regra de marca Angola).
const AVISO_LIMITE =
  "Ui, muitas perguntas de seguida! 🌾 Dê-me só um instante e volte a tentar. Se for urgente, fale com a equipa em geral@quenteebom.co.ao ou faça o seu pedido em massaprima.com/cotacao.html.";

// Verificação Turnstile (Cloudflare) — só ativa se houver TURNSTILE_SECRET.
// Devolve {ok, motivo}. Em modo suave (sem ENFORCE) o resultado é registado mas não bloqueia.
async function verificarTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return { ok: true, motivo: "desligado" }; // Turnstile não configurado
  if (!token) return { ok: false, motivo: "sem-token" };
  try {
    const body = new URLSearchParams({ secret, response: String(token).slice(0, 4000) });
    if (ip && ip !== "?") body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(),
    });
    const j = await r.json();
    return { ok: !!j.success, motivo: (j["error-codes"] || []).join(",") || "" };
  } catch (e) {
    console.error("chef-prima: turnstile falha", e);
    return { ok: false, motivo: "erro-verificacao" };
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// Motor Gemini (via gateway da Netlify). Resiliente: fallback de modelo em 404,
// 2ª chave de reserva (env GEMINI_API_KEY_2, de OUTRO projeto) em 401/403/429,
// retry em 429/5xx e filtragem das partes de "thinking".
let geminiModeloOk = null; // memoiza o modelo que funcionou nesta instância
async function planoBGemini(system, mensagens, maxTokens) {
  const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const chaves = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
  if (!chaves.length || !base) return null;
  const preferido = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const modelos = geminiModeloOk ? [geminiModeloOk] : [preferido, "gemini-flash-latest"];
  const corpo = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: mensagens.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : "" }],
    })),
    generationConfig: { maxOutputTokens: maxTokens },
  });
  const pedir = (modelo, chave) => fetch(`${base}/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": chave }, body: corpo,
  });
  for (const modelo of modelos) {
    let modeloIndisponivel = false;
    for (const chave of chaves) {
      try {
        let r = await pedir(modelo, chave);
        if (!r.ok && (r.status === 429 || r.status >= 500)) { // rajada curta → 1 retry
          await new Promise((res) => setTimeout(res, 1200));
          r = await pedir(modelo, chave);
        }
        if (r.status === 404) { console.error("chef-prima: Gemini modelo 404", modelo); modeloIndisponivel = true; break; } // tenta próximo modelo
        if (r.status === 401 || r.status === 403 || r.status === 429) { console.error("chef-prima: Gemini chave", r.status); continue; } // tenta próxima chave
        if (!r.ok) { console.error("chef-prima: Gemini", r.status, (await r.text()).slice(0, 200)); continue; }
        const j = await r.json();
        const texto = (j?.candidates?.[0]?.content?.parts || [])
          .filter((p) => !p.thought).map((p) => p.text || "").join("").trim(); // ignora partes de thinking
        if (texto) { geminiModeloOk = modelo; return texto; }
      } catch (e) { console.error("chef-prima: Gemini falha de rede", e); }
    }
    if (!modeloIndisponivel && geminiModeloOk === modelo) break;
  }
  return null;
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!origemValida(req)) return json({ error: "origem" }, 403);

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "?";
  // 1) rate-limit por IP (minuto/hora) → 429 amável
  if (limiteIp(ip)) return json({ reply: AVISO_LIMITE }, 429);
  // 2) teto diário global → fallback gracioso (nunca erro)
  if (tetoDiarioExcedido()) return json({ reply: CONTINGENCIA });

  // Precisa de PELO MENOS um motor: Gemini (principal) ou Anthropic (reforço opcional).
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return json({ reply: CONTINGENCIA });

  // 3) teto de tamanho do corpo → 413 (barato: header primeiro, depois o texto real)
  const cl = Number(req.headers.get("content-length") || 0);
  if (cl && cl > MAX_BODY_BYTES) return json({ error: "corpo demasiado grande" }, 413);
  let texto;
  try { texto = await req.text(); } catch { return json({ error: "pedido inválido" }, 400); }
  if (texto.length > MAX_BODY_BYTES) return json({ error: "corpo demasiado grande" }, 413);
  let corpo;
  try { corpo = JSON.parse(texto); } catch { return json({ error: "pedido inválido" }, 400); }

  // Turnstile (opcional, NÃO-fatal): só EXIGE token se houver TURNSTILE_SECRET e ENFORCE=on.
  const temSecret = !!process.env.TURNSTILE_SECRET;
  const enforce = temSecret && process.env.TURNSTILE_ENFORCE === "on";
  if (temSecret) {
    const ts = await verificarTurnstile(corpo?.turnstileToken, ip);
    if (!ts.ok) {
      console.error("chef-prima: turnstile", ts.motivo, "enforce=", enforce);
      if (enforce) return json({ reply: AVISO_LIMITE }, 403); // bloqueia só em modo duro
      // modo suave: regista e continua — um widget mal configurado nunca deita o bot abaixo
    }
  }

  // 4) sanitização do histórico: últimas N mensagens, cada uma limitada em caracteres
  const raw = Array.isArray(corpo?.messages) ? corpo.messages : [];
  const messages = raw.slice(-MAX_MSGS).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, MAX_CHARS),
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
