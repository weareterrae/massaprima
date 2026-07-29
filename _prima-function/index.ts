// Supabase Edge Function: prima-web (Chef Prima — Massa Prima)
// Mesmo padrão do bento-web (Joaquim/QeB): o SYSTEM_PROMPT vive no site
// (https://weareterrae.github.io/massaprima/prima-prompt.txt) e atualiza-se por git push.
// Secrets usados (já existem no projeto): ANTHROPIC_API_KEY, CLAUDE_MODEL (opcional)
// Deploy: Supabase Dashboard → Edge Functions → nova função "prima-web" → colar → Deploy (JWT verification OFF)

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5";
const PROMPT_URL = "https://weareterrae.github.io/massaprima/prima-prompt.txt";
const PROMPT_TTL_MS = 5 * 60 * 1000;

const FALLBACK_PROMPT = `És o Chef Prima 🌾, o mestre padeiro digital da Massa Prima — marca angolana de matérias-primas de panificação e pastelaria da Quente e Bom (Viana, Luanda), em grande parte produzida em Angola. Tom caloroso, técnico-acessível, PT com naturalidade angolana, respostas curtas. Ensinas a usar os mixes, receitas e food cost (ideal 25-35% do preço de venda). NUNCA digas preços nem menciones parceiros de produção. Contacto: geral@quenteebom.co.ao. Receitas: /massaprima/receitas.html · Catálogo: /massaprima/catalogo.html · Food cost: /massaprima/foodcost.html`;

let promptCache = { text: "", ts: 0 };

async function getPrompt(): Promise<string> {
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
  } catch (_) { /* usa fallback */ }
  return promptCache.text || FALLBACK_PROMPT;
}

function cors(_origin: string | null) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json",
  };
}

// Modo de contingência: quando a IA não está disponível, o Chef Prima responde
// com os encaminhamentos essenciais em vez de um erro.
const CONTINGENCIA =
  "Olá! 🌾 Estou em manutenção por umas horas, mas ajudo já: veja o [catálogo com os 88 produtos e fichas técnicas](https://massaprima.com/catalogo.html), as [receitas](https://massaprima.com/receitas.html) e a [calculadora de food cost](https://massaprima.com/foodcost.html). Para cotações, use o [pedido de cotação](https://massaprima.com/cotacao.html) — a equipa responde por email. Até já!";

// Proteção anti-abuso: limite por IP (janela deslizante) + teto diário global.
// Em memória por isolate — best-effort, suficiente para travar floods e bots.
const IP_LIMITE = 8;            // pedidos por IP
const IP_JANELA_MS = 60_000;    // por minuto
const DIA_LIMITE = 400;         // teto de pedidos por isolate e por dia
const baldeIp = new Map<string, number[]>();
let diaTotal = 0;
let diaInicio = 0;

function excedeuLimites(ip: string): boolean {
  const agora = Date.now();
  if (agora - diaInicio > 86_400_000) { diaInicio = agora; diaTotal = 0; }
  if (++diaTotal > DIA_LIMITE) return true;
  const recentes = (baldeIp.get(ip) ?? []).filter((t) => agora - t < IP_JANELA_MS);
  recentes.push(agora);
  baldeIp.set(ip, recentes);
  if (baldeIp.size > 5000) baldeIp.clear(); // trava crescimento de memória
  return recentes.length > IP_LIMITE;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

  const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
  if (excedeuLimites(ip)) {
    return new Response(JSON.stringify({ error: "IA indisponível" }), { status: 429, headers });
  }

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages em falta" }), { status: 400, headers });
    }
    const clean = messages.slice(-12).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 1000),
    }));

    const system = await getPrompt();

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 600,
        system,
        messages: clean,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("Claude API error:", err);
      return new Response(JSON.stringify({ reply: CONTINGENCIA }), { status: 200, headers });
    }
    const data = await r.json();
    const reply = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return new Response(JSON.stringify({ reply }), { status: 200, headers });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "pedido inválido" }), { status: 400, headers });
  }
});
