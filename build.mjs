// ============================================================================
//  BUILD — massaprima.com
//  Fonte de verdade única: data/products.json + data/recipes.json
//  Faz: validação de schema · contadores derivados · sincroniza #dados ·
//       pré-render dos cards no HTML (conteúdo sem JS) · corrige contagens.
//  Uso: node build.mjs        (build completo)
//       node build.mjs --validate-only
//  Output estático; o Netlify continua a servir os ficheiros como estão.
// ============================================================================
import fs from "node:fs";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (f) => fs.readFileSync(f, "utf8");
const validateOnly = process.argv.includes("--validate-only");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- carregar fonte única ----
const products = JSON.parse(read("data/products.json"));
const recipes  = JSON.parse(read("data/recipes.json"));

// ---- validação (item inválido não parte o catálogo: avisa e exclui do render) ----
const issues = [];
const REQ_P = ["id", "slug", "nome", "segmento", "subfamilia", "marca", "formatos"];
const REQ_R = ["id", "slug", "cat", "titulo", "foto", "tempo", "rend"];
function validate(list, req, label) {
  const seen = new Set();
  return list.filter((it) => {
    const miss = req.filter((k) => it[k] === undefined || it[k] === null || it[k] === "");
    if (miss.length) { issues.push(`${label} "${it.id || "?"}": campos em falta → ${miss.join(", ")}`); return false; }
    if (seen.has(it.slug)) { issues.push(`${label} slug duplicado → ${it.slug}`); return false; }
    seen.add(it.slug);
    return true;
  });
}
const P = validate(products, REQ_P, "produto");
const R = validate(recipes, REQ_R, "receita");

// ---- dados em falta para validação humana (não inventar) ----
const humanCheck = [];
P.forEach((p) => { if (!p.img) humanCheck.push(`produto ${p.id}: sem imagem`); });
R.forEach((r) => { if (!r.foto) humanCheck.push(`receita ${r.id}: sem foto`); });

// ---- contadores derivados (única fonte) ----
const counts = {
  produtos: P.length,
  produtosPorSegmento: P.reduce((a, p) => ((a[p.segmento] = (a[p.segmento] || 0) + 1), a), {}),
  produtosPorMarca: P.reduce((a, p) => ((a[p.marca] = (a[p.marca] || 0) + 1), a), {}),
  receitas: R.length,
  receitasPorCategoria: R.reduce((a, r) => ((a[r.cat] = (a[r.cat] || 0) + 1), a), {}),
};

// ---- helpers de render (espelham exatamente o JS das páginas) ----
const cor = (seg) => (seg === "Padaria" ? "var(--laranja)" : "var(--past)");
function kgLabel(f) {
  if (typeof f !== "object") return (f === 2.5 ? "2,5" : f) + " kg";
  const v = String(f.kg).replace(".", ","), u = f.unidade && f.unidade !== "kg" ? (f.unidade === "lt" ? "L" : f.unidade) : "kg";
  return (f.pack ? f.pack + "× " : "") + v + " " + u;
}
// CORES das receitas: ler do próprio receitas.html (fonte do estilo)
function coresReceitas() {
  try {
    const m = read("receitas.html").match(/const\s+CORES\s*=\s*(\{[\s\S]*?\})/);
    if (m) return JSON.parse(m[1].replace(/'/g, '"').replace(/,(\s*})/g, "$1"));
  } catch { /* fallback */ }
  return {};
}
const CORES = coresReceitas();

// segmentos pela ordem de aparição nos dados (como o JS: [...new Set(...)])
const segs = [...new Set(P.map((p) => p.segmento))];

function catalogCardsHTML() {
  const grupos = {};
  P.forEach((p) => { (grupos[p.segmento] = grupos[p.segmento] || {})[p.subfamilia] = (grupos[p.segmento][p.subfamilia] || []).concat(p); });
  let out = "";
  for (const seg of segs) {
    if (!grupos[seg]) continue;
    out += `<h2 class="famtitle${seg === "Pastelaria" ? " past" : ""}">${esc(seg)}</h2>`;
    for (const sub of Object.keys(grupos[seg]).sort()) {
      out += `<div class="subnote">${esc(sub)}</div><div class="grid">`;
      for (const p of grupos[seg][sub]) {
        const pz = p.marca !== "Massa Prima";
        const thumb = p.img
          ? `<div class="thumb"><img loading="lazy" src="${esc(p.img)}" alt="${esc(p.nome)}"></div>`
          : `<div class="thumb ph"><span>${esc(p.subfamilia)}</span></div>`;
        out += `<a class="pcard" href="catalogo.html#${esc(p.slug)}">${thumb}<div class="pbody">` +
          `<span class="tag" style="color:${cor(seg)}">${esc(p.subfamilia)}</span>` +
          (pz ? `<span class="mkbadge">${esc(p.marca)}</span>` : "") +
          `<h3>${esc(p.nome.replace("Massa Prima ", ""))}</h3>` +
          `<p class="d">${esc(p.desc || "")}</p>` +
          `<div class="fmts">${(p.formatos || []).map((f) => `<span class="kg">${esc(kgLabel(f))}</span>`).join("")}</div>` +
          `<span class="ver">Ver ficha técnica →</span></div></a>`;
      }
      out += `</div>`;
    }
  }
  return out;
}

function recipeCardsHTML() {
  return R.map((r) => {
    const color = CORES[r.cat] || "var(--laranja-d)";
    return `<a class="rcard" href="receitas.html#${esc(r.slug)}">` +
      `<div class="thumb"><img loading="lazy" src="${esc(r.foto)}" alt="${esc(r.titulo)}" onerror="this.onerror=null;this.src='assets/produtos/hero.jpg'"></div>` +
      `<div class="body"><span class="tag" style="color:${color}">${esc(r.cat)}</span>` +
      `<h3>${esc(r.titulo)}</h3><p class="meta">⏱ ${esc(r.tempo)} · 🥖 ${esc(r.rend)}</p>` +
      `<span class="ver">Ver receita →</span></div></a>`;
  }).join("");
}

// ---- substituições seguras num ficheiro HTML ----
function replaceDados(html, arr) {
  return html.replace(/(<script id="dados"[^>]*>)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(arr)}$2`);
}
function injectInner(html, openRe, closeRe, inner) {
  // substitui o conteúdo entre a abertura e o fecho (idempotente)
  const re = new RegExp(`(${openRe})[\\s\\S]*?(${closeRe})`);
  return html.replace(re, `$1${inner}$2`);
}

// ---- BUILD ----
const changed = [];
if (!validateOnly) {
  // catalogo.html: #dados + pré-render #lista
  let cat = read("catalogo.html");
  cat = replaceDados(cat, P);
  cat = injectInner(cat, '<div id="lista">', '</div><div class="empty" id="empty"', catalogCardsHTML());
  fs.writeFileSync("catalogo.html", cat); changed.push("catalogo.html");

  // receitas.html: #dados + pré-render #grid + corrigir contagem "42 receitas"
  let rec = read("receitas.html");
  rec = replaceDados(rec, R);
  rec = injectInner(rec, '<div class="grid" id="grid">', "</div></main>", recipeCardsHTML());
  rec = rec.replace(/\b42 receitas\b/g, `${counts.receitas} receitas`);
  fs.writeFileSync("receitas.html", rec); changed.push("receitas.html");

  // NOTA: foodcost.html usa um dataset DERIVADO (schema {id,t,rend,un,ing}, gerado
  // a partir das `tabela` das receitas — o antigo build_foodcost.js). NÃO sincronizar
  // com as receitas cruas (partiria a calculadora). Derivação = passo próprio (P2).
}

// ---- relatório ----
console.log("═══ BUILD massaprima.com ═══");
console.log(`Produtos válidos: ${counts.produtos}  (${JSON.stringify(counts.produtosPorSegmento)} · ${JSON.stringify(counts.produtosPorMarca)})`);
console.log(`Receitas válidas: ${counts.receitas}  (${JSON.stringify(counts.receitasPorCategoria)})`);
console.log(`Problemas de validação: ${issues.length}`);
issues.forEach((i) => console.log("  ✗ " + i));
console.log(`Dados em falta p/ validação humana: ${humanCheck.length}`);
humanCheck.slice(0, 10).forEach((h) => console.log("  ⚠ " + h));
if (!validateOnly) console.log("Ficheiros atualizados: " + changed.join(", "));
// escrever contadores derivados para consumo futuro (ex.: homepage)
fs.writeFileSync("data/counts.json", JSON.stringify(counts, null, 2));
console.log("Contadores → data/counts.json");
if (issues.length) process.exitCode = 1;
