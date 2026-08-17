// CRM Nº5 — ponte de leads pelo endpoint seguro /api/leads/ingest.
// O Netlify invoca esta função em CADA submissão verificada de qualquer formulário
// do site. Envia a lead ao CRM Nº5, que a coloca no pipeline (crm_leads) da org
// deste site — a org é determinada pelo TOKEN, não exposta aqui.
//
// Seguro: NÃO usa a service_role. Usa um token scoped desta org (só pode criar
// leads nesta org, com dedup e limite de ritmo no lado do CRM). Revogável em `org_tokens`.
//
// NOTA: funções event-triggered (submission-created) exigem a API v1 do Netlify
// (export const handler) — a API v2 (export default) nunca é invocada nestes eventos.
//
// À prova de falha: qualquer erro é registado no log e devolve 200 — a submissão
// e a notificação por email do Netlify nunca são afetadas.
//
// Variável de ambiente necessária (Netlify → Environment variables):
//   CRM_INGEST_TOKEN → o token desta org (dado pela equipa Nº5)

const INGEST = "https://app.numerocinco.pt/api/leads/ingest";

export const handler = async (event) => {
  const ok = { statusCode: 200, body: "ok" };
  const token = process.env.CRM_INGEST_TOKEN;
  if (!token) { console.log("CRM Nº5: falta CRM_INGEST_TOKEN — lead não sincronizada (email segue normalmente)."); return ok; }

  let payload;
  try { payload = JSON.parse(event.body).payload; } catch (e) { console.error("CRM Nº5: payload inválido", e); return ok; }
  const d = payload?.data || {};
  const form = payload?.form_name || "desconhecido";

  const email = d.email || (String(d.contacto || "").includes("@") ? d.contacto : "");
  const telefone = d.telefone || d.telemovel || d.whatsapp || (String(d.contacto || "").includes("@") ? "" : (d.contacto || ""));
  const nome = d.nome || d.name || "";
  const { "bot-field": _bf, "form-name": _fn, ...campos } = d;

  try {
    await fetch(INGEST, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, nome, telefone, email, origem: "site", fonte_detalhe: `Formulário: ${form}`, campos }),
    });
  } catch (e) {
    console.error("CRM Nº5: ingest falhou", e);
  }
  return ok;
};
