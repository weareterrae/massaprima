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
const slugify = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " e ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
        out += `<a class="pcard" href="/catalogo/${esc(p.slug)}/">${thumb}<div class="pbody">` +
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
    return `<a class="rcard" href="/receitas/${esc(r.slug)}/">` +
      `<div class="thumb"><img loading="lazy" src="${esc(r.foto)}" alt="${esc(r.titulo)}" onerror="this.onerror=null;this.src='assets/produtos/hero.jpg'"></div>` +
      `<div class="body"><span class="tag" style="color:${color}">${esc(r.cat)}</span>` +
      `<h3>${esc(r.titulo)}</h3><p class="meta">⏱ ${esc(r.tempo)} · 🥖 ${esc(r.rend)}</p>` +
      `<span class="ver">Ver receita →</span></div></a>`;
  }).join("");
}

// ============================================================================
//  PÁGINAS INDIVIDUAIS  /catalogo/<slug>/  e  /receitas/<slug>/
// ============================================================================
const SITE = "https://massaprima.com";
const OG = SITE + "/assets/og-image.jpg";

// dosagem: porta o renderReceita do catalogo.html (mesma lógica)
const vazio = (v) => !v || v === "—" || v === "-";
function renderReceita(r) {
  if (!r || !r.rows || !r.rows.length) return "";
  const ncol = Math.max(1, ...r.rows.map((x) => (x.vals || []).length));
  const keep = [];
  for (let i = 0; i < ncol; i++) if (r.rows.some((row) => !vazio((row.vals || [])[i]))) keep.push(i);
  if (!keep.length) keep.push(0);
  const cab = r.cab || [];
  const th = "<th>Ingrediente</th>" + keep.map((i) => `<th class="num">${esc(cab[i] || "")}</th>`).join("");
  let body = "";
  for (const row of r.rows) {
    if ((row.vals || []).every(vazio)) body += `<tr class="grp"><td colspan="${keep.length + 1}">${esc(row.label)}</td></tr>`;
    else body += `<tr><td>${esc(row.label)}</td>${keep.map((i) => `<td class="num">${vazio((row.vals || [])[i]) ? "—" : esc(row.vals[i])}</td>`).join("")}</tr>`;
  }
  return `<div class="block"><h2>Receita / Dosagem</h2><div class="tbl"><table class="tec"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

const BRAND_CSS = `
:root{--laranja:#EC6607;--laranja-d:#c9550a;--castanho:#77310A;--bege:#FEEAD3;--bege-claro:#FFF7EC;--ink:#3D1A05;--sand-line:#eaddc9;--muted:#8a6a4a;--past:#a8451a}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Nunito',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bege-claro);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--laranja-d)}
img{max-width:100%;display:block}
.wrap{max-width:1060px;margin:0 auto;padding:0 20px}
header{background:#fff;border-bottom:1px solid var(--sand-line);position:sticky;top:0;z-index:20}
header .nav{max-width:1060px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
header .logo img{height:38px}
header nav a{color:var(--ink);text-decoration:none;font-weight:700;font-size:.92rem;margin-left:16px}
header nav a.cta{background:var(--laranja);color:#fff;padding:9px 16px;border-radius:40px}
@media(max-width:820px){header nav a:not(.cta){display:none}}
.crumbs{font-size:.82rem;color:var(--muted);padding:18px 0 0}
.crumbs a{color:var(--muted);text-decoration:none}.crumbs a:hover{color:var(--laranja-d)}
.hero{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:34px;align-items:start;padding:20px 0 34px}
@media(max-width:760px){.hero{grid-template-columns:1fr}}
.hero .ph{border-radius:20px;overflow:hidden;border:1px solid var(--sand-line);background:#fff;aspect-ratio:4/3}
.hero .ph img{width:100%;height:100%;object-fit:cover}
.eyebrow{display:inline-block;font-weight:800;font-size:.74rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--laranja-d)}
.mkbadge{display:inline-block;font-size:.7rem;font-weight:800;color:#fff;background:var(--castanho);padding:3px 10px;border-radius:20px;margin-left:8px}
h1{font-family:'Zilla Slab',Georgia,serif;color:var(--castanho);font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.1;margin:10px 0 12px;text-wrap:balance}
.lead{color:#5a4029;font-size:1.05rem;max-width:60ch}
.fmts{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
.kg{background:#fff;border:1px solid var(--sand-line);border-radius:20px;padding:5px 13px;font-weight:800;font-size:.86rem;color:var(--castanho)}
.cta-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:800;border-radius:40px;padding:12px 22px;text-decoration:none;font-size:.95rem;border:2px solid var(--laranja);cursor:pointer}
.btn.primary{background:var(--laranja);color:#fff}.btn.ghost{background:transparent;color:var(--laranja-d)}
.block{background:#fff;border:1px solid var(--sand-line);border-radius:18px;padding:22px 24px;margin:16px 0}
.block h2{font-family:'Zilla Slab',serif;color:var(--castanho);font-size:1.2rem;margin-bottom:12px}
.block ul,.block ol{padding-left:20px}.block li{margin-bottom:7px}
.tbl{overflow-x:auto}
table.tec{width:100%;border-collapse:collapse;font-size:.92rem}
table.tec th,table.tec td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--sand-line)}
table.tec .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.tec tr.grp td{background:var(--bege);font-weight:800;color:var(--castanho)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:.92rem}
.kv dt{font-weight:800;color:var(--castanho)}
.rel{margin:30px 0 10px}
.rel h2{font-family:'Zilla Slab',serif;color:var(--castanho);font-size:1.3rem;margin-bottom:14px}
.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.rgrid a{background:#fff;border:1px solid var(--sand-line);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column}
.rgrid .th{aspect-ratio:4/3;overflow:hidden;background:var(--bege)}.rgrid .th img{width:100%;height:100%;object-fit:cover}
.rgrid .t{padding:10px 12px;font-weight:800;color:var(--castanho);font-size:.9rem}
footer{background:var(--castanho);color:var(--bege);text-align:center;padding:34px 20px;margin-top:40px}
footer img{height:40px;margin:0 auto 10px}
footer a{color:var(--bege)}
@media print{header,footer,.cta-row,.crumbs,.rel{display:none}body{background:#fff}.block{border:none;padding:8px 0}}
`;

function head({ title, desc, canonical, jsonld }) {
  return `<!DOCTYPE html><html lang="pt-AO"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OG}"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#EC6607">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@600;700&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>${BRAND_CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head><body>
<header><div class="nav">
<a class="logo" href="/index.html"><img src="/assets/logo_principal.png" alt="Massa Prima"></a>
<nav><a href="/catalogo.html">Catálogo</a><a href="/receitas.html">Receitas</a><a href="/foodcost.html">Food Cost</a><a href="/formacao">Formação</a><a class="cta" href="/cotacao.html">Pedir cotação</a></nav>
</div></header>`;
}
const FOOT = `<footer><div class="wrap"><img src="/assets/logo_bege.png" alt="Massa Prima"><p><em>qualidade que inspira resultados perfeitos</em></p><p style="margin-top:8px">Massa Prima <span style="opacity:.7">by Quente e Bom</span> · <a href="mailto:geral@quenteebom.co.ao">geral@quenteebom.co.ao</a></p><p style="opacity:.7;font-size:.85rem;margin-top:6px">© 2026 Massa Prima · Quente e Bom, Angola</p></div></footer></body></html>`;

const crumbs = (arr) => `<nav class="crumbs" aria-label="Breadcrumb">${arr.map((c, i) => (c.href ? `<a href="${c.href}">${esc(c.name)}</a>` : `<span>${esc(c.name)}</span>`) + (i < arr.length - 1 ? " › " : "")).join("")}</nav>`;
const breadcrumbLd = (arr) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: arr.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, ...(c.href ? { item: SITE + c.href } : {}) })) });

const relRecipesForProduct = (p) => R.filter((r) => (r.usados || []).some((u) => u.id === p.id)).slice(0, 6);
const relProducts = (p) => P.filter((x) => x.id !== p.id && x.subfamilia === p.subfamilia).slice(0, 6);

function productPage(p) {
  const title = p.seoTitle || `${p.nome} — ficha técnica | Massa Prima`;
  const desc = p.seoDescription || (p.desc || `${p.nome}, gama ${p.marca}. Ficha técnica: aplicações, dosagem e formatos.`).slice(0, 155);
  const url = `${SITE}/catalogo/${p.slug}/`;
  const pz = p.marca !== "Massa Prima";
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Catálogo", href: "/catalogo.html" }, { name: p.segmento, href: `/catalogo.html#${encodeURIComponent(p.segmento)}` }, { name: p.nome }];
  const prodLd = { "@context": "https://schema.org", "@type": "Product", name: p.nome, category: `${p.segmento} / ${p.subfamilia}`, brand: { "@type": "Brand", name: p.marca }, url, ...(p.img ? { image: `${SITE}/${p.img}` } : {}), ...(p.desc ? { description: p.desc } : {}) };
  const rec = relRecipesForProduct(p), rp = relProducts(p);
  const thumb = p.img ? `<div class="ph"><img src="/${esc(p.img)}" alt="${esc(p.nome)}"></div>` : `<div class="ph"></div>`;
  const sec = [];
  if (p.metodo && p.metodo.length) sec.push(`<div class="block"><h2>Modo de aplicação</h2><ol>${p.metodo.map((m) => `<li>${esc(m)}</li>`).join("")}</ol></div>`);
  sec.push(renderReceita(p.receita));
  if (p.ingredientes) sec.push(`<div class="block"><h2>Ingredientes</h2><p>${esc(p.ingredientes)}</p></div>`);
  if (p.alergenios) sec.push(`<div class="block"><h2>Alergénios</h2><p>${esc(p.alergenios)}</p></div>`);
  if (p.nutri && p.nutri.length) sec.push(`<div class="block"><h2>Informação nutricional</h2><div class="tbl"><table class="tec"><tbody>${p.nutri.map((n) => `<tr><td>${esc(n[0])}</td><td class="num">${esc(n[1])}</td></tr>`).join("")}</tbody></table></div></div>`);
  const cons = [];
  if (p.validade) cons.push(`<dt>Validade</dt><dd>${esc(p.validade)}</dd>`);
  if (p.conservacao) cons.push(`<dt>Conservação</dt><dd>${esc(p.conservacao)}</dd>`);
  if (cons.length) sec.push(`<div class="block"><h2>Conservação</h2><dl class="kv">${cons.join("")}</dl></div>`);
  const mail = `mailto:geral@quenteebom.co.ao?subject=${encodeURIComponent("Massa Prima — " + p.nome)}`;
  return head({ title, desc, canonical: url, jsonld: [prodLd, breadcrumbLd(cb)] }) + `<main class="wrap">
${crumbs(cb)}
<article class="hero">${thumb}<div>
<span class="eyebrow">${esc(p.subfamilia)}</span>${pz ? `<span class="mkbadge">${esc(p.marca)}</span>` : ""}
<h1>${esc(p.nome)}</h1>
${p.desc ? `<p class="lead">${esc(p.desc)}</p>` : ""}
<div class="fmts">${(p.formatos || []).map((f) => `<span class="kg">${esc(kgLabel(f))}</span>`).join("")}</div>
<div class="cta-row"><a class="btn primary" href="/cotacao.html?produto=${esc(p.slug)}">Adicionar ao pedido de cotação</a><a class="btn ghost" href="${mail}">Falar com a equipa</a></div>
</div></article>
${sec.join("\n")}
<div class="cta-row" style="margin:6px 0 10px"><button class="btn ghost" onclick="window.print()">Imprimir ficha técnica</button></div>
${rec.length ? `<section class="rel"><h2>Receitas com este produto</h2><div class="rgrid">${rec.map((r) => `<a href="/receitas/${esc(r.slug)}/"><div class="th"><img loading="lazy" src="/${esc(r.foto)}" alt="${esc(r.titulo)}"></div><div class="t">${esc(r.titulo)}</div></a>`).join("")}</div></section>` : ""}
${rp.length ? `<section class="rel"><h2>Produtos relacionados</h2><div class="rgrid">${rp.map((x) => `<a href="/catalogo/${esc(x.slug)}/"><div class="th">${x.img ? `<img loading="lazy" src="/${esc(x.img)}" alt="${esc(x.nome)}">` : ""}</div><div class="t">${esc(x.nome.replace("Massa Prima ", ""))}</div></a>`).join("")}</div></section>` : ""}
</main>` + FOOT;
}

function recipePage(r) {
  const title = r.seoTitle || `${r.titulo} — receita profissional | Massa Prima`;
  const desc = r.seoDescription || (r.venda || r.dica || `Receita profissional ${r.titulo} com produtos Massa Prima. Rende ${r.rend}.`).slice(0, 155);
  const url = `${SITE}/receitas/${r.slug}/`;
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Receitas", href: "/receitas.html" }, { name: r.cat, href: `/receitas.html#${encodeURIComponent(r.cat)}` }, { name: r.titulo }];
  const ingr = (r.tabela || []).filter((row) => !(row[1] === "" && /^—/.test(row[0]))).map((row) => `${row[0]}${row[1] ? " — " + row[1] : ""}`);
  const recipeLd = { "@context": "https://schema.org", "@type": "Recipe", name: r.titulo, recipeCategory: r.cat, ...(r.foto ? { image: `${SITE}/${r.foto}` } : {}), ...(r.rend ? { recipeYield: r.rend } : {}), recipeIngredient: ingr, recipeInstructions: (r.metodo || []).map((m) => ({ "@type": "HowToStep", text: m })) };
  const rel = R.filter((x) => x.id !== r.id && x.cat === r.cat).slice(0, 6);
  const usados = (r.usados || []).map((u) => (u.id && P.some((p) => p.id === u.id)) ? `<a href="/catalogo/${esc(u.id)}/">${esc(u.n)}</a>` : `<span>${esc(u.n)}</span>`).join(" · ");
  const usadosIds = (r.usados || []).filter((u) => u.id && P.some((p) => p.id === u.id)).map((u) => u.id).join(",");
  const cotaHref = usadosIds ? `/cotacao.html?produtos=${usadosIds}` : "/cotacao.html";
  const tabela = (r.tabela || []).map((row) => (row[1] === "" && /^—/.test(row[0])) ? `<tr class="grp"><td colspan="2">${esc(row[0].replace(/—/g, "").trim())}</td></tr>` : `<tr><td>${esc(row[0])}</td><td class="num">${esc(row[1])}</td></tr>`).join("");
  return head({ title, desc, canonical: url, jsonld: [recipeLd, breadcrumbLd(cb)] }) + `<main class="wrap">
${crumbs(cb)}
<article class="hero"><div class="ph"><img src="/${esc(r.foto)}" alt="${esc(r.titulo)}" onerror="this.onerror=null;this.src='/assets/produtos/hero.jpg'"></div><div>
<span class="eyebrow">${esc(r.cat)}</span>
<h1>${esc(r.titulo)}</h1>
<p class="lead">⏱ ${esc(r.tempo)} · 🥖 ${esc(r.rend)}${r.dificuldade ? " · " + esc(r.dificuldade) : ""}</p>
<div class="cta-row"><a class="btn primary" href="/foodcost.html?receita=${esc(r.slug)}">Calcular food cost</a><a class="btn ghost" href="${cotaHref}">Adicionar ingredientes à cotação</a></div>
</div></article>
${tabela ? `<div class="block"><h2>Ingredientes</h2><div class="tbl"><table class="tec"><tbody>${tabela}</tbody></table></div></div>` : ""}
${usados ? `<div class="block"><h2>Produtos Massa Prima usados</h2><p>${usados}</p></div>` : ""}
${(r.metodo && r.metodo.length) ? `<div class="block"><h2>Método</h2><ol>${r.metodo.map((m) => `<li>${esc(m)}</li>`).join("")}</ol></div>` : ""}
${r.dica ? `<div class="block"><h2>Dica do Chef</h2><p>${esc(r.dica)}</p></div>` : ""}
${r.venda ? `<div class="block"><h2>Como vender mais</h2><p>${esc(r.venda)}</p></div>` : ""}
<div class="cta-row" style="margin:6px 0 10px"><button class="btn ghost" onclick="window.print()">Imprimir receita</button></div>
${rel.length ? `<section class="rel"><h2>Mais receitas de ${esc(r.cat)}</h2><div class="rgrid">${rel.map((x) => `<a href="/receitas/${esc(x.slug)}/"><div class="th"><img loading="lazy" src="/${esc(x.foto)}" alt="${esc(x.titulo)}"></div><div class="t">${esc(x.titulo)}</div></a>`).join("")}</div></section>` : ""}
</main>` + FOOT;
}

function categoryGrid(items) {
  return items.map((it) => {
    const isProd = it.segmento !== undefined;
    const href = isProd ? `/catalogo/${esc(it.slug)}/` : `/receitas/${esc(it.slug)}/`;
    const img = isProd ? it.img : it.foto;
    const nome = isProd ? it.nome.replace("Massa Prima ", "") : it.titulo;
    return `<a href="${href}"><div class="th">${img ? `<img loading="lazy" src="/${esc(img)}" alt="${esc(nome)}">` : ""}</div><div class="t">${esc(nome)}</div></a>`;
  }).join("");
}
function productCategoryPage(seg) {
  const items = P.filter((p) => p.segmento === seg), slug = slugify(seg), url = `${SITE}/catalogo/categoria/${slug}/`;
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Catálogo", href: "/catalogo.html" }, { name: seg }];
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: `${seg} — Catálogo Massa Prima`, url };
  return head({ title: `${seg} — matérias-primas | Massa Prima`, desc: `Gama ${seg} da Massa Prima: ${items.length} produtos com ficha técnica, dosagem e formatos.`, canonical: url, jsonld: [ld, breadcrumbLd(cb)] }) +
    `<main class="wrap">${crumbs(cb)}<h1>${esc(seg)}</h1><p class="lead" style="margin-bottom:18px">${items.length} produtos com ficha técnica. <a href="/catalogo.html">Ver catálogo completo →</a></p><div class="rgrid">${categoryGrid(items)}</div></main>` + FOOT;
}
function recipeCategoryPage(cat) {
  const items = R.filter((r) => r.cat === cat), slug = slugify(cat), url = `${SITE}/receitas/categoria/${slug}/`;
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Receitas", href: "/receitas.html" }, { name: cat }];
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: `Receitas de ${cat} — Massa Prima`, url };
  return head({ title: `Receitas de ${cat} | Massa Prima`, desc: `${items.length} receitas profissionais de ${cat} com produtos Massa Prima e food cost.`, canonical: url, jsonld: [ld, breadcrumbLd(cb)] }) +
    `<main class="wrap">${crumbs(cb)}<h1>${esc(cat)}</h1><p class="lead" style="margin-bottom:18px">${items.length} receitas profissionais. <a href="/receitas.html">Ver todas as receitas →</a></p><div class="rgrid">${categoryGrid(items)}</div></main>` + FOOT;
}
const productCats = [...new Set(P.map((p) => p.segmento))];
const recipeCats = [...new Set(R.map((r) => r.cat))];

function buildSitemap() {
  const pages = ["/", "/catalogo.html", "/receitas.html", "/foodcost.html", "/cotacao.html", "/formacao.html", "/privacidade.html"];
  const urls = [
    ...pages.map((u) => ({ loc: SITE + u })),
    ...productCats.map((c) => ({ loc: `${SITE}/catalogo/categoria/${slugify(c)}/` })),
    ...recipeCats.map((c) => ({ loc: `${SITE}/receitas/categoria/${slugify(c)}/` })),
    ...P.map((p) => ({ loc: `${SITE}/catalogo/${p.slug}/` })),
    ...R.map((r) => ({ loc: `${SITE}/receitas/${r.slug}/` })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc></url>`).join("\n")}\n</urlset>\n`;
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

  // páginas individuais /catalogo/<slug>/ e /receitas/<slug>/
  let np = 0, nr = 0;
  for (const p of P) { fs.mkdirSync(`catalogo/${p.slug}`, { recursive: true }); fs.writeFileSync(`catalogo/${p.slug}/index.html`, productPage(p)); np++; }
  for (const r of R) { fs.mkdirSync(`receitas/${r.slug}`, { recursive: true }); fs.writeFileSync(`receitas/${r.slug}/index.html`, recipePage(r)); nr++; }
  changed.push(`${np} páginas de produto`, `${nr} páginas de receita`);

  // páginas de categoria
  for (const c of productCats) { const s = slugify(c); fs.mkdirSync(`catalogo/categoria/${s}`, { recursive: true }); fs.writeFileSync(`catalogo/categoria/${s}/index.html`, productCategoryPage(c)); }
  for (const c of recipeCats) { const s = slugify(c); fs.mkdirSync(`receitas/categoria/${s}`, { recursive: true }); fs.writeFileSync(`receitas/categoria/${s}/index.html`, recipeCategoryPage(c)); }
  changed.push(`${productCats.length}+${recipeCats.length} páginas de categoria`);

  // sitemap.xml regenerado com todas as URLs
  fs.writeFileSync("sitemap.xml", buildSitemap()); changed.push("sitemap.xml");

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
