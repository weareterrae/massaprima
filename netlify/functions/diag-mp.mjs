// TEMPORÁRIO: sonda do AI Gateway no site massaprima (remover depois do diagnóstico).
// Só nomes de env vars (nunca valores) + teste real a cada caminho de IA.
export default async () => {
  const nomes = Object.keys(process.env).filter((k) => /ANTHROPIC|GEMINI|GOOGLE|OPENAI|AI_GATE/i.test(k)).sort();
  const saida = { nomes };

  // Caminho 1: Claude via gateway
  try {
    const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
    const r = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 20, messages: [{ role: "user", content: "diz ok" }] }),
    });
    saida.claude = { base: base.includes("anthropic.com") ? "DIRETO(!!)" : "gateway", status: r.status, corpo: (await r.text()).slice(0, 200) };
  } catch (e) { saida.claude = { erro: String(e) }; }

  // Caminho 2: Gemini via gateway
  try {
    const gbase = (process.env.GOOGLE_GEMINI_BASE_URL || "").replace(/\/$/, "");
    if (!gbase) { saida.gemini = "sem GOOGLE_GEMINI_BASE_URL"; }
    else {
      const r = await fetch(`${gbase}/v1beta/models/gemini-2.5-flash:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "diz ok" }] }], generationConfig: { maxOutputTokens: 10 } }),
      });
      saida.gemini = { status: r.status, corpo: (await r.text()).slice(0, 200) };
    }
  } catch (e) { saida.gemini = { erro: String(e) }; }

  return new Response(JSON.stringify(saida, null, 2), { headers: { "content-type": "application/json" } });
};
export const config = { path: "/api/diag-mp-7q2" };
