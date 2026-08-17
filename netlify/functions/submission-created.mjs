// CRM Nº5 — ponte automática de leads.
// O Netlify invoca esta função em CADA submissão verificada de qualquer formulário
// do site. Insere a lead no pipeline nativo do CRM Nº5 (`crm_leads`, etapa "nova")
// da organização desta marca, com cópia bruta em `leads`.
//
// NOTA: funções event-triggered (submission-created) exigem a API v1 do Netlify
// (export const handler) — a API v2 (export default) nunca é invocada nestes eventos.
//
// À prova de falha: se algo correr mal, regista no log e devolve 200 — a submissão
// e a notificação por email do Netlify nunca são afetadas.
//
// Variável de ambiente necessária (Netlify → Environment variables):
//   N5_SUPABASE_KEY → service_role key do projeto Nº5 (a mesma em todos os sites)

const SUPABASE_URL = "https://rycgekqszxyudmchpqvs.supabase.co";
const ORG_ID = "309ec0e1-1faf-452f-948c-96c92f5959df"; // Massa Prima

let etapaNovaId = null; // cache entre invocações do mesmo processo
async function getEtapaNova(headers) {
  if (etapaNovaId) return etapaNovaId;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_etapas?org_id=eq.${ORG_ID}&chave=eq.nova&select=id`, { headers });
  if (r.ok) { const rows = await r.json(); etapaNovaId = rows[0]?.id || null; }
  return etapaNovaId;
}

export const handler = async (event) => {
  const ok = { statusCode: 200, body: "ok" };
  const KEY = process.env.N5_SUPABASE_KEY;
  if (!KEY) { console.log("CRM Nº5: falta N5_SUPABASE_KEY — lead não sincronizada (email segue normalmente)."); return ok; }

  let payload;
  try { payload = JSON.parse(event.body).payload; } catch (e) { console.error("CRM Nº5: payload inválido", e); return ok; }
  const d = payload?.data || {};
  const form = payload?.form_name || "desconhecido";

  const email = d.email || (String(d.contacto || "").includes("@") ? d.contacto : "");
  const telefone = d.telefone || d.telemovel || (String(d.contacto || "").includes("@") ? "" : (d.contacto || ""));
  const nome = d.nome || d.name || email || "Lead do site";

  const headers = { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" };

  // Notas legíveis: mensagem + todos os outros campos preenchidos.
  const IGNORAR = new Set(["bot-field", "form-name", "nome", "name", "email", "contacto", "telefone", "telemovel", "mensagem"]);
  const extra = Object.entries(d).filter(([k, v]) => v && !IGNORAR.has(k)).map(([k, v]) => `${k}: ${v}`);
  const notas = [d.mensagem ? `— Mensagem —\n${d.mensagem}` : "", extra.length ? extra.join("\n") : ""].filter(Boolean).join("\n\n");

  // 1) Pipeline nativo do CRM (o que aparece no cartão da lead)
  try {
    const etapa = await getEtapaNova(headers);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_leads`, {
      method: "POST", headers,
      body: JSON.stringify({ org_id: ORG_ID, etapa_id: etapa, nome, email, telefone, origem: "site", fonte_detalhe: `Formulário: ${form}`, notas, campos: { form, ...d } }),
    });
    if (!r.ok) console.error("CRM Nº5: insert crm_leads falhou", r.status, (await r.text()).slice(0, 300));
    else console.log(`CRM Nº5: lead no pipeline (${form})`);
  } catch (e) { console.error("CRM Nº5: erro em crm_leads", e); }

  // 2) Registo bruto (backup)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: "POST", headers,
      body: JSON.stringify({ org_id: ORG_ID, origem: "formulario", form, nome: d.nome || "", email, telefone, mensagem: d.mensagem || "", pagina: payload?.site_url || "" }),
    });
  } catch (e) { console.error("CRM Nº5: erro em leads (raw)", e); }

  return ok;
};
