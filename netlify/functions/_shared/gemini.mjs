// Motor Gemini partilhado — resiliente a quedas transitórias do Google
// (503 "overloaded", 429, 5xx, timeouts). Usado pelo /api/chef-prima (chat)
// e pelo monitor de saúde (chef-prima-alerta): um soluço curto do Google é
// absorvido em silêncio, sem cair na mensagem de contingência.
//
// Padrão de resiliência:
//   • Chaves : [GEMINI_API_KEY, GEMINI_API_KEY_2].filter(Boolean). Nenhuma → ok:false.
//   • Modelos: [<modelo atual>, "gemini-2.0-flash"] (o atual continua principal).
//   • Até 3 tentativas por (chave, modelo). Backoff 400ms * tentativa.
//   • TRANSITÓRIO (repete): 408, 425, 429, 500, 502, 503, 504 + AbortError/rede.
//   • PERMANENTE (400/401/403/404): não repete → próximo modelo.
//   • Texto VAZIO: não repete → próximo modelo.
//   • Devolve o texto no 1.º sucesso; ok:false só quando tudo falha.

const TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]); // vale a pena repetir
const PERMANENTES = new Set([400, 401, 403, 404]);                 // não repetir → próximo modelo

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Devolve { ok, texto, motivo }. `texto` só quando ok=true; `motivo` descreve a última falha.
export async function chamarGemini({ system, mensagens, maxTokens, modelo, timeoutMs = 0 } = {}) {
  const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const chaves = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
  if (!chaves.length || !base) return { ok: false, motivo: "sem chave" };

  const preferido = modelo || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const modelos = [preferido, "gemini-2.0-flash"].filter((m, i, a) => m && a.indexOf(m) === i); // atual = principal + reserva

  const corpo = JSON.stringify({
    ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
    contents: (mensagens || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : "" }],
    })),
    generationConfig: { maxOutputTokens: maxTokens },
  });

  let motivo = "sem resposta";
  for (const chave of chaves) {
    for (const mod of modelos) {
      let saltarModelo = false; // permanente / vazio → salta já para o próximo modelo
      for (let tentativa = 1; tentativa <= 3 && !saltarModelo; tentativa++) {
        const ctl = timeoutMs ? new AbortController() : null;
        const tm = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
        try {
          const r = await fetch(`${base}/v1beta/models/${mod}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": chave },
            body: corpo,
            ...(ctl ? { signal: ctl.signal } : {}),
          });
          if (r.ok) {
            const j = await r.json();
            const texto = (j?.candidates?.[0]?.content?.parts || [])
              .filter((p) => !p.thought).map((p) => p.text || "").join("").trim(); // ignora partes de thinking
            if (texto) return { ok: true, texto };
            motivo = "resposta vazia"; saltarModelo = true; break; // vazio → próximo modelo
          }
          motivo = `HTTP ${r.status}`;
          if (PERMANENTES.has(r.status)) { saltarModelo = true; break; }             // não repete → próximo modelo
          if (!TRANSITORIOS.has(r.status)) { saltarModelo = true; break; }            // desconhecido → próximo modelo
          if (tentativa < 3) await espera(400 * tentativa);                           // transitório → backoff e repete
        } catch (e) {
          motivo = String((e && e.name) || e);                                        // AbortError / rede = transitório
          if (tentativa < 3) await espera(400 * tentativa);
        } finally { if (tm) clearTimeout(tm); }
      }
    }
  }
  return { ok: false, motivo };
}
