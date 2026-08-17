// Ping horário ao motor de IA do Chef Prima. Se cair, avisa por email — e avisa
// de novo quando recuperar — com estado guardado (Netlify Blobs) para não spammar.
// Totalmente opcional: só corre se as env vars existirem; nunca afeta o site.
// Env necessárias: GEMINI_API_KEY (já existe), RESEND_API_KEY, ALERT_EMAIL.
// Opcional: ALERT_FROM (remetente verificado no Resend; default onboarding@resend.dev).
import { getStore } from "@netlify/blobs";

const MODEL = "gemini-flash-latest";

async function pingMotor() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const ctrl = new AbortController();
  const prazo = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`${base}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 8 } }),
      signal: ctrl.signal,
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(prazo);
  }
}

export default async () => {
  const resend = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!process.env.GEMINI_API_KEY || !resend || !to) return new Response("alerta desativado (faltam env vars)");

  const up = await pingMotor();
  const estado = up ? "up" : "down";
  let store = null, antes = "up";
  try { store = getStore("chef-prima-health"); antes = (await store.get("estado")) || "up"; } catch { /* sem blobs: avisa na mesma na 1ª deteção */ }

  if (estado !== antes) {
    const assunto = up ? "✅ O Chef Prima recuperou — massaprima.com" : "🔴 O Chef Prima em baixo — motor de IA (Massa Prima)";
    const texto = up
      ? "O motor de IA do Chef Prima voltou a responder ao ping horário. Tudo normal."
      : "O motor de IA do Chef Prima (Gemini, o principal) NÃO respondeu ao ping horário. O site tem o Claude como reforço e um modo de contingência, mas convém verificar a GEMINI_API_KEY no Netlify e a conta Google AI Studio.";
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resend}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.ALERT_FROM || "Nº 5 <onboarding@resend.dev>", to: [to], subject: assunto, text: texto }),
      });
    } catch { /* falha de email não pode partir a função */ }
    if (store) try { await store.set("estado", estado); } catch {}
  }
  return new Response(`estado: ${estado}`);
};

export const config = { schedule: "@hourly" };
