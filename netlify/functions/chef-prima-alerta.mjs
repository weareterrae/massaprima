// Chef Prima — monitor de saúde (função AGENDADA, hora a hora).
// Faz um ping real ao motor (Gemini) e alerta o dono por email quando cai E quando
// recupera. Estado guardado em Netlify Blobs para NÃO enviar spam (um alerta por
// avaria, um por recuperação). Best-effort: sem RESEND_API_KEY, só regista nos logs.
// É uma função à parte — não toca no /api/chef-prima nem no widget.

import { getStore } from "@netlify/blobs";
import { chamarGemini } from "./_shared/gemini.mjs";

const SITE = "https://massaprima.com";
const ALERT_EMAIL = process.env.ALERT_EMAIL || "sandro.qb@gmail.com";
const ALERT_FROM = process.env.ALERT_FROM || "Chef Prima <onboarding@resend.dev>"; // funciona em modo teste do Resend

// Ping ao motor Gemini (o mesmo que o bot usa). Usa o motor partilhado resiliente
// (retry com backoff + fallback de chave e de modelo, timeout de 12s por tentativa),
// para NÃO dar falso alarme num soluço transitório do Google.
async function pingMotor() {
  if (!process.env.GEMINI_API_KEY) return { ok: false, motivo: "sem GEMINI_API_KEY" };
  const r = await chamarGemini({
    mensagens: [{ role: "user", content: "responde só: ok" }],
    maxTokens: 16,
    timeoutMs: 12000,
  });
  return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
}

async function enviarEmail(assunto, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log("chef-prima-alerta: sem RESEND_API_KEY — não envio email:", assunto); return false; }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_EMAIL], subject: assunto, html }),
    });
    if (!r.ok) { console.error("chef-prima-alerta: Resend", r.status, (await r.text()).slice(0, 200)); return false; }
    return true;
  } catch (e) { console.error("chef-prima-alerta: email falhou", e); return false; }
}

export default async () => {
  const agora = new Date().toISOString();
  const res = await pingMotor();

  // estado persistente (Netlify Blobs) — best-effort; se indisponível, segue sem estado
  let store = null;
  let estado = { down: false };
  try {
    store = getStore("chef-prima-monitor");
    const s = await store.get("estado", { type: "json" });
    if (s && typeof s.down === "boolean") estado = s;
  } catch (e) { console.error("chef-prima-alerta: Blobs indisponível", e); }

  if (res.ok) {
    if (estado.down) {
      await enviarEmail("✅ Chef Prima recuperado", `<p>O Chef Prima (<a href="${SITE}">${SITE}</a>) voltou a responder.</p><p>Hora (UTC): ${agora}</p>`);
      estado = { down: false, desde: agora };
    }
  } else {
    if (!estado.down) {
      await enviarEmail("⚠️ Chef Prima em baixo", `<p>O motor de IA do Chef Prima (<a href="${SITE}">${SITE}</a>) não está a responder.</p><p>Motivo: <b>${res.motivo}</b></p><p>Hora (UTC): ${agora}</p><p>Verifica o Gemini (quota/chave) ou o gateway da Netlify. O site continua a mostrar a mensagem de contingência aos visitantes.</p>`);
      estado = { down: true, desde: agora };
    }
  }

  try { if (store) await store.setJSON("estado", estado); } catch (e) { console.error("chef-prima-alerta: gravar estado falhou", e); }

  console.log("chef-prima-alerta:", res.ok ? "UP" : "DOWN", res.motivo || "", "| estado:", JSON.stringify(estado));
  return new Response(JSON.stringify({ ok: res.ok, estado, agora }), { headers: { "content-type": "application/json" } });
};

// Agendada: no minuto 0 de cada hora.
export const config = { schedule: "0 * * * *" };
