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
// Envolve um <img> (que aponta a .jpg) numa <picture> com fonte WebP + fallback JPG.
const webpOf = (src) => String(src).replace(/\.(jpe?g|png)$/i, ".webp");
const pic = (src, imgHtml) => `<picture><source srcset="/${esc(webpOf(src))}" type="image/webp">${imgHtml}</picture>`;

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
:root{--laranja:#EC6607;--laranja-d:#c9550a;--castanho:#77310A;--bege:#FEEAD3;--bege-claro:#FFF7EC;--ink:#3D1A05;--sand-line:#eaddc9;--muted:#8a6a4a;--past:#a8451a;--ease-out:cubic-bezier(0.23,1,0.32,1);--ease-in-out:cubic-bezier(0.77,0,0.175,1)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Nunito',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bege-claro);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--laranja-d)}
img{max-width:100%;display:block}
.wrap{max-width:1060px;margin:0 auto;padding:0 20px}
header{background:#fff;border-bottom:1px solid var(--sand-line);position:sticky;top:0;z-index:20;transition:box-shadow 200ms ease,border-color 200ms ease}
header.scrolled{box-shadow:0 6px 22px rgba(119,49,10,.10);border-color:transparent}
header .nav{max-width:1060px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
header .logo img{height:38px}
header nav a{position:relative;color:var(--ink);text-decoration:none;font-weight:700;font-size:.92rem;margin-left:16px;transition:color 150ms ease}
header nav a:not(.cta)::after{content:'';position:absolute;left:0;right:0;bottom:-3px;height:2px;background:var(--laranja);border-radius:2px;transform:scaleX(0);transform-origin:left;transition:transform 180ms var(--ease-out)}
header nav a.cta{background:var(--laranja);color:#fff;padding:9px 16px;border-radius:40px;transition:background 160ms ease,transform 160ms var(--ease-out)}
header nav a.cta:active{transform:scale(.97)}
@media(max-width:820px){header nav a:not(.cta){display:none}}
.crumbs{font-size:.82rem;color:var(--muted);padding:18px 0 0}
.crumbs a{color:var(--muted);text-decoration:none;transition:color 150ms ease}.crumbs a:hover{color:var(--laranja-d)}
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
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:800;border-radius:40px;padding:12px 22px;text-decoration:none;font-size:.95rem;border:2px solid var(--laranja);cursor:pointer;transition:transform 160ms var(--ease-out),background 160ms ease,color 160ms ease,border-color 160ms ease}
.btn.primary{background:var(--laranja);color:#fff}.btn.ghost{background:transparent;color:var(--laranja-d)}
.btn:active{transform:scale(.97)}
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
.rgrid a{background:#fff;border:1px solid var(--sand-line);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:transform 220ms var(--ease-out),box-shadow 220ms var(--ease-out),border-color 200ms ease}
.rgrid .th{aspect-ratio:4/3;overflow:hidden;background:var(--bege)}.rgrid .th img{width:100%;height:100%;object-fit:cover;transition:transform 450ms var(--ease-out)}
.rgrid .t{padding:10px 12px;font-weight:800;color:var(--castanho);font-size:.9rem}
footer{background:var(--castanho);color:var(--bege);text-align:center;padding:34px 20px;margin-top:40px}
footer img{height:40px;margin:0 auto 10px}
footer a{color:var(--bege)}
.share{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:18px 0 4px;font-size:.9rem}
.share span{font-weight:800;color:var(--muted)}
.share .sh{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:.86rem;color:var(--castanho);background:#fff;border:1px solid var(--sand-line);border-radius:40px;padding:7px 15px;text-decoration:none;cursor:pointer;font-family:inherit;transition:border-color 160ms ease,color 160ms ease,transform 120ms var(--ease-out)}
.share .sh:hover{border-color:var(--laranja);color:var(--laranja-d)}
.share .sh:active{transform:scale(.97)}
.faq details{background:#fff;border:1px solid var(--sand-line);border-radius:12px;margin-bottom:10px;overflow:hidden}
.faq summary{cursor:pointer;font-weight:800;color:var(--castanho);padding:14px 18px;list-style:none;font-size:.98rem;transition:color 150ms ease}
.faq summary:hover{color:var(--laranja-d)}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';float:right;color:var(--laranja);font-weight:800;font-size:1.1rem;line-height:1.3}
.faq details[open] summary::after{content:'–'}
.faq details>p{padding:0 18px 15px;color:#5a4029;font-size:.95rem}
.faq details[open]>p{animation:faqIn 220ms var(--ease-out)}
@keyframes faqIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
a:focus-visible,button:focus-visible,summary:focus-visible,.btn:focus-visible{outline:2px solid var(--laranja);outline-offset:3px;border-radius:8px}
@media (hover:hover) and (pointer:fine){
  header nav a:not(.cta):hover{color:var(--laranja-d)}
  header nav a:not(.cta):hover::after{transform:scaleX(1)}
  .btn.primary:hover{background:var(--castanho);border-color:var(--castanho)}
  .btn.ghost:hover{background:var(--laranja);color:#fff}
  .rgrid a:hover,.anim .rgrid a.in:hover{transform:translateY(-4px);box-shadow:0 14px 30px rgba(119,49,10,.13);border-color:var(--bege)}
  .rgrid a:hover .th img{transform:scale(1.04)}
}
.anim .rgrid a{opacity:0;transform:translateY(10px);transition:opacity 420ms var(--ease-out),transform 260ms var(--ease-out),box-shadow 220ms var(--ease-out),border-color 200ms ease}
.anim .rgrid a.in{opacity:1;transform:none}
@media print{header,footer,.cta-row,.crumbs,.rel,.share{display:none}body{background:#fff}.block{border:none;padding:8px 0}}
@media (prefers-reduced-motion: no-preference){
  @view-transition{navigation:auto}
  ::view-transition-old(root),::view-transition-new(root){animation-duration:.25s}
}
@media (prefers-reduced-motion: reduce){
  .rgrid a:hover,.rgrid a:hover .th img,.btn:active,.share .sh:active,header nav a.cta:active{transform:none}
  header nav a:not(.cta)::after{display:none}
  .faq details[open]>p{animation:none}
}
`;

// partilha (sem WhatsApp — copiar link + Facebook)
function shareBar(url, title) {
  const u = encodeURIComponent(url);
  return `<div class="share" aria-label="Partilhar esta página"><span>Partilhar</span>` +
    `<a class="sh" href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener" aria-label="Partilhar no Facebook">Facebook</a>` +
    `<button class="sh" type="button" onclick="var b=this;if(navigator.clipboard){navigator.clipboard.writeText('${url}').then(function(){b.textContent='Link copiado ✓';setTimeout(function(){b.textContent='Copiar link'},1800)})}">Copiar link</button></div>`;
}
// FAQ factual do produto (só perguntas com resposta real) → {html, ld}
function productFaq(p) {
  const qa = [];
  const fmts = (p.formatos || []).map((f) => kgLabel(f)).filter(Boolean);
  if (fmts.length) qa.push(["Em que formatos está disponível?", `${p.nome} está disponível em ${fmts.join(", ")}. Indique o formato pretendido no pedido de cotação.`]);
  if (p.validade || p.conservacao) qa.push(["Qual é a validade e como se conserva?", [p.validade ? `Validade: ${p.validade}.` : "", p.conservacao ? `Conservação: ${p.conservacao}.` : ""].filter(Boolean).join(" ")]);
  qa.push(["Como peço o preço ou faço uma encomenda?", `Adicione o produto ao pedido de cotação e a nossa equipa comercial responde em privado com o preço e o plano de entregas. Também pode escrever para geral@quenteebom.co.ao.`]);
  qa.push(["Posso pedir uma amostra?", `Sim. Indique este produto no pedido de cotação e mencione que pretende amostra — a equipa comercial trata do resto.`]);
  qa.push(["Dão apoio técnico e formação?", `Sim. A nossa equipa técnica demonstra os produtos e forma a sua equipa, na sua padaria ou nas nossas instalações em Viana. Veja a página de Formação.`]);
  const html = `<section class="block faq"><h2>Perguntas frequentes</h2>${qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>`;
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return { html, ld };
}

function head({ title, desc, canonical, jsonld }) {
  return `<!DOCTYPE html><html lang="pt-AO"><head>
<script>try{if(matchMedia('(prefers-reduced-motion:no-preference)').matches&&'IntersectionObserver'in window)document.documentElement.className+=' anim'}catch(e){}</script>
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
<script>window.MP_CFG={ga4:"G-RZJDD89EGH",gtm:""};</script>
<script src="/assets/js/analytics.js" defer></script>
</head><body>
<header><div class="nav">
<a class="logo" href="/index.html"><img src="/assets/logo_principal.png" alt="Massa Prima"></a>
<nav><a href="/catalogo.html">Catálogo</a><a href="/receitas.html">Receitas</a><a href="/solucoes/">Soluções</a><a href="/foodcost.html">Food Cost</a><a href="/formacao">Formação</a><a href="/contactos/">Contactos</a><a class="cta" href="/cotacao.html">Pedir cotação</a></nav>
</div></header>`;
}
const FOOT = `<footer><div class="wrap"><img src="/assets/logo_bege.png" alt="Massa Prima"><p><em>qualidade que inspira resultados perfeitos</em></p><p style="margin-top:8px">Massa Prima <span style="opacity:.7">by Quente e Bom</span> · <a href="mailto:geral@quenteebom.co.ao">geral@quenteebom.co.ao</a></p><p style="opacity:.7;font-size:.85rem;margin-top:6px">© 2026 Massa Prima · Doce, Quente e Bom Angola, Lda · NIF 5417154385 · Viana, Luanda</p><p style="opacity:.6;font-size:.8rem;margin-top:6px">Site por <a href="https://numerocinco.pt" target="_blank" rel="noopener" style="color:inherit">Nº&nbsp;5</a></p></div></footer>
<script>(function(){var h=document.querySelector('header');if(h){var s=function(){h.classList.toggle('scrolled',(window.pageYOffset||0)>8)};s();addEventListener('scroll',s,{passive:true})}if(!document.documentElement.classList.contains('anim'))return;var sel='.rgrid a';var reveal=function(el,d){el.style.transitionDelay=(d||0)+'ms';el.classList.add('in')};try{var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){reveal(e.target,(+e.target.getAttribute('data-d')||0));io.unobserve(e.target)}})},{rootMargin:'0px 0px -60px 0px',threshold:.06});document.querySelectorAll('.rgrid').forEach(function(g){[].forEach.call(g.children,function(c,i){c.setAttribute('data-d',(i%7)*50)})});document.querySelectorAll(sel).forEach(function(e){io.observe(e)})}catch(err){document.querySelectorAll(sel).forEach(function(e){e.classList.add('in')})}addEventListener('load',function(){setTimeout(function(){document.querySelectorAll(sel).forEach(function(e){if(!e.classList.contains('in'))e.classList.add('in')})},500)})})();</script>
<script src="/assets/js/chefprima.js" defer></script></body></html>`;

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
  const thumb = p.img ? `<div class="ph">${pic(p.img, `<img src="/${esc(p.img)}" alt="${esc(p.nome)}">`)}</div>` : `<div class="ph"></div>`;
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
  const faq = productFaq(p);
  return head({ title, desc, canonical: url, jsonld: [prodLd, faq.ld, breadcrumbLd(cb)] }) + `<main class="wrap">
${crumbs(cb)}
<article class="hero">${thumb}<div>
<span class="eyebrow">${esc(p.subfamilia)}</span>${pz ? `<span class="mkbadge">${esc(p.marca)}</span>` : ""}
<h1>${esc(p.nome)}</h1>
${p.desc ? `<p class="lead">${esc(p.desc)}</p>` : ""}
<div class="fmts">${(p.formatos || []).map((f) => `<span class="kg">${esc(kgLabel(f))}</span>`).join("")}</div>
<div class="cta-row"><a class="btn primary" href="/cotacao.html?produto=${esc(p.slug)}">Adicionar ao pedido de cotação</a><a class="btn ghost" href="/cotacao.html?produto=${esc(p.slug)}&amostra=1">Pedir amostra</a><a class="btn ghost" href="${mail}">Falar com a equipa</a></div>
${shareBar(url, p.nome)}
</div></article>
${sec.join("\n")}
${faq.html}
<div class="cta-row" style="margin:6px 0 10px"><button class="btn ghost" onclick="window.print()">Imprimir ficha técnica</button></div>
${rec.length ? `<section class="rel"><h2>Receitas com este produto</h2><div class="rgrid">${rec.map((r) => `<a href="/receitas/${esc(r.slug)}/"><div class="th">${pic(r.foto, `<img loading="lazy" src="/${esc(r.foto)}" alt="${esc(r.titulo)}">`)}</div><div class="t">${esc(r.titulo)}</div></a>`).join("")}</div></section>` : ""}
${rp.length ? `<section class="rel"><h2>Produtos relacionados</h2><div class="rgrid">${rp.map((x) => `<a href="/catalogo/${esc(x.slug)}/"><div class="th">${x.img ? pic(x.img, `<img loading="lazy" src="/${esc(x.img)}" alt="${esc(x.nome)}">`) : ""}</div><div class="t">${esc(x.nome.replace("Massa Prima ", ""))}</div></a>`).join("")}</div></section>` : ""}
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
<article class="hero"><div class="ph">${pic(r.foto, `<img src="/${esc(r.foto)}" alt="${esc(r.titulo)}" onerror="this.onerror=null;this.src='/assets/produtos/hero.jpg'">`)}</div><div>
<span class="eyebrow">${esc(r.cat)}</span>
<h1>${esc(r.titulo)}</h1>
<p class="lead">⏱ ${esc(r.tempo)} · 🥖 ${esc(r.rend)}${r.dificuldade ? " · " + esc(r.dificuldade) : ""}</p>
<div class="cta-row"><a class="btn primary" href="/foodcost.html?receita=${esc(r.slug)}">Calcular food cost</a><a class="btn ghost" href="${cotaHref}">Adicionar ingredientes à cotação</a></div>
${shareBar(url, r.titulo)}
</div></article>
${tabela ? `<div class="block"><h2>Ingredientes</h2><div class="tbl"><table class="tec"><tbody>${tabela}</tbody></table></div></div>` : ""}
${usados ? `<div class="block"><h2>Produtos Massa Prima usados</h2><p>${usados}</p></div>` : ""}
${(r.metodo && r.metodo.length) ? `<div class="block"><h2>Método</h2><ol>${r.metodo.map((m) => `<li>${esc(m)}</li>`).join("")}</ol></div>` : ""}
${r.dica ? `<div class="block"><h2>Dica do Chef</h2><p>${esc(r.dica)}</p></div>` : ""}
${r.venda ? `<div class="block"><h2>Como vender mais</h2><p>${esc(r.venda)}</p></div>` : ""}
<div class="cta-row" style="margin:6px 0 10px"><button class="btn ghost" onclick="window.print()">Imprimir receita</button></div>
${rel.length ? `<section class="rel"><h2>Mais receitas de ${esc(r.cat)}</h2><div class="rgrid">${rel.map((x) => `<a href="/receitas/${esc(x.slug)}/"><div class="th">${pic(x.foto, `<img loading="lazy" src="/${esc(x.foto)}" alt="${esc(x.titulo)}">`)}</div><div class="t">${esc(x.titulo)}</div></a>`).join("")}</div></section>` : ""}
</main>` + FOOT;
}

function categoryGrid(items) {
  return items.map((it) => {
    const isProd = it.segmento !== undefined;
    const href = isProd ? `/catalogo/${esc(it.slug)}/` : `/receitas/${esc(it.slug)}/`;
    const img = isProd ? it.img : it.foto;
    const nome = isProd ? it.nome.replace("Massa Prima ", "") : it.titulo;
    return `<a href="${href}"><div class="th">${img ? pic(img, `<img loading="lazy" src="/${esc(img)}" alt="${esc(nome)}">`) : ""}</div><div class="t">${esc(nome)}</div></a>`;
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

function contactosPage() {
  const url = `${SITE}/contactos/`;
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Contactos" }];
  const ld = {
    "@context": "https://schema.org", "@type": "Organization",
    name: "Massa Prima", legalName: "Doce, Quente e Bom Angola, Lda", taxID: "5417154385", url: SITE, logo: `${SITE}/assets/logo_principal.png`,
    email: "geral@quenteebom.co.ao",
    address: { "@type": "PostalAddress", streetAddress: "Estrada do Calumbo/Zango, Condomínio Viana Park, Armazém 1Q8", addressLocality: "Viana", addressRegion: "Luanda", addressCountry: "AO" },
    sameAs: ["https://www.instagram.com/massaprima", "https://www.facebook.com/1109918612215834"],
  };
  return head({ title: "Contactos — Massa Prima | Fale com a nossa equipa", desc: "Contactos da Massa Prima (by Quente e Bom), Viana — Luanda: email, morada, redes e pedido de cotação para padarias e pastelarias.", canonical: url, jsonld: [ld, breadcrumbLd(cb)] }) +
    `<main class="wrap">${crumbs(cb)}
<h1>Contactos</h1>
<p class="lead" style="margin-bottom:20px">A <b>Massa Prima</b> é uma marca da <b>Quente e Bom</b> — matérias-primas de panificação e pastelaria para padarias, pastelarias e quem produz para vender, em toda a Angola.</p>
<div class="block"><h2>Falar com a equipa comercial</h2><dl class="kv">
<dt>E-mail</dt><dd><a href="mailto:geral@quenteebom.co.ao">geral@quenteebom.co.ao</a></dd>
<dt>Morada</dt><dd>Estrada do Calumbo/Zango, Condomínio Viana Park, Armazém 1Q8, Viana — Luanda, Angola</dd>
<dt>Instagram</dt><dd><a href="https://www.instagram.com/massaprima" target="_blank" rel="noopener">@massaprima</a></dd>
<dt>Facebook</dt><dd><a href="https://www.facebook.com/1109918612215834" target="_blank" rel="noopener">Massa Prima</a></dd>
</dl>
<div class="cta-row" style="margin-top:18px"><a class="btn primary" href="/cotacao.html">Pedir cotação</a><a class="btn ghost" href="mailto:geral@quenteebom.co.ao?subject=Massa%20Prima%20%E2%80%94%20contacto">Enviar e-mail</a></div>
</div>
<div class="block"><h2>Empresa e faturação</h2><dl class="kv">
<dt>Entidade</dt><dd>Doce, Quente e Bom Angola, Lda</dd>
<dt>NIF</dt><dd>5417154385</dd>
<dt>Marca</dt><dd>Massa Prima — matérias-primas de panificação e pastelaria</dd>
</dl></div>
<div class="block"><h2>Preços, encomendas e amostras</h2><p>Não publicamos preços no site — cada negócio é diferente. Peça a sua cotação e a nossa equipa prepara uma proposta à medida, com o plano de entregas.</p></div>
<div class="block"><h2>Privacidade e ferramentas</h2><p>Os preços que introduz na <a href="/foodcost.html">calculadora de food cost</a> ficam guardados só no seu dispositivo. Consulte a nossa <a href="/privacidade.html">Política de Privacidade</a>.</p></div>
</main>` + FOOT;
}

// ── Soluções por segmento ─────────────────────────────────────
const SEGMENTOS = [
  { slug: "padarias-pastelarias", nome: "Padarias e pastelarias",
    lead: "Mixes e matérias-primas para produzir pão, bolos e doçaria com a mesma qualidade todos os dias — e vender mais.",
    necessidades: ["Pão que rende igual, fornada após fornada", "Vitrine variada de bolos e doçaria", "Controlar o custo e acertar o preço de venda", "Formar a equipa e resolver problemas de produção"],
    seg: "Padaria", cats: ["Pão", "Vitrine & Café"] },
  { slug: "hotelaria-restauracao", nome: "Hotéis, restauração e catering",
    lead: "Produção própria de pão, sobremesas e pastelaria para o seu serviço, com receitas testadas e apoio técnico.",
    necessidades: ["Sobremesas e pastelaria de qualidade constante", "Pão e viennoiserie para o serviço", "Produção que se antecipa e conserva bem", "Custo por dose sob controlo"],
    seg: "Pastelaria", cats: ["Bolos & Tortas", "Vitrine & Café", "Tradicional & Festas"] },
  { slug: "producao-industrial", nome: "Produção industrial",
    lead: "Matérias-primas para produção em escala, com fichas técnicas, rendimento consistente e formatos de trabalho.",
    necessidades: ["Rendimento e resultado constantes em grande volume", "Fichas técnicas com dosagem e aplicação", "Formatos adequados à produção", "Conservação e validade claras"],
    seg: "Padaria", cats: ["Pão"] },
  { slug: "revendedores-distribuidores", nome: "Revendedores e distribuidores",
    lead: "Uma gama completa de padaria e pastelaria para revender, com fichas técnicas e apoio à sua rede de clientes.",
    necessidades: ["Gama completa num só fornecedor", "Fichas técnicas que apoiam a venda", "Apoio técnico e formação para os seus clientes", "Receitas e food cost como material de apoio"],
    seg: null, cats: ["Pão", "Vitrine & Café", "Bolos & Tortas"] },
];
function solucoesPage(s) {
  const url = `${SITE}/solucoes/${s.slug}/`;
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Soluções", href: "/solucoes/" }, { name: s.nome }];
  const prods = P.filter((p) => !s.seg || p.segmento === s.seg).slice(0, 6);
  const recs = R.filter((r) => s.cats.includes(r.cat)).slice(0, 6);
  const prodGrid = prods.map((p) => `<a href="/catalogo/${esc(p.slug)}/"><div class="th">${p.img ? pic(p.img, `<img loading="lazy" src="/${esc(p.img)}" alt="${esc(p.nome)}">`) : ""}</div><div class="t">${esc(p.nome.replace("Massa Prima ", ""))}</div></a>`).join("");
  const recGrid = recs.map((r) => `<a href="/receitas/${esc(r.slug)}/"><div class="th">${pic(r.foto, `<img loading="lazy" src="/${esc(r.foto)}" alt="${esc(r.titulo)}">`)}</div><div class="t">${esc(r.titulo)}</div></a>`).join("");
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: `${s.nome} — Soluções Massa Prima`, url };
  return head({ title: `${s.nome} — Soluções | Massa Prima`, desc: `${s.lead} Produtos, receitas, formação e apoio técnico da Massa Prima para ${s.nome.toLowerCase()}.`.slice(0, 155), canonical: url, jsonld: [ld, breadcrumbLd(cb)] }) +
    `<main class="wrap">${crumbs(cb)}
<span class="eyebrow">Soluções</span>
<h1>${esc(s.nome)}</h1>
<p class="lead" style="margin-bottom:16px">${esc(s.lead)}</p>
<div class="cta-row" style="margin-bottom:8px"><a class="btn primary" href="/cotacao.html">Pedir cotação</a><a class="btn ghost" href="/formacao">Pedir demonstração</a></div>
${shareBar(url, s.nome + " — Massa Prima")}
<div class="block"><h2>O que este segmento precisa</h2><ul>${s.necessidades.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
${prodGrid ? `<section class="rel"><h2>Produtos indicados</h2><div class="rgrid">${prodGrid}</div><p style="margin-top:10px"><a href="/catalogo.html">Ver catálogo completo →</a></p></section>` : ""}
${recGrid ? `<section class="rel"><h2>Receitas para começar</h2><div class="rgrid">${recGrid}</div><p style="margin-top:10px"><a href="/receitas.html">Ver todas as receitas →</a></p></section>` : ""}
<div class="block"><h2>Não vendemos só matéria-prima. Ensinamos.</h2><p>A nossa equipa técnica vai à sua produção, demonstra os produtos ao vivo e forma a sua equipa — incluído no acompanhamento. Some a isso as receitas com dosagens oficiais, a calculadora de food cost e o Chef Prima 24/7.</p><div class="cta-row" style="margin-top:8px"><a class="btn ghost" href="/formacao">Formação e demonstração</a><a class="btn ghost" href="/foodcost.html">Calcular food cost</a></div></div>
<div class="block"><h2>Vamos pôr a sua produção a render?</h2><p>Peça a sua cotação e a nossa equipa prepara uma proposta à medida.</p><div class="cta-row" style="margin-top:8px"><a class="btn primary" href="/cotacao.html">Pedir cotação</a><a class="btn ghost" href="mailto:geral@quenteebom.co.ao">Falar com a equipa</a></div></div>
</main>` + FOOT;
}
function solucoesHub() {
  const url = `${SITE}/solucoes/`;
  const cb = [{ name: "Início", href: "/index.html" }, { name: "Soluções" }];
  const cards = SEGMENTOS.map((s) => `<a href="/solucoes/${s.slug}/" class="block" style="text-decoration:none;color:inherit;display:block"><h2 style="margin-bottom:6px">${esc(s.nome)}</h2><p style="color:#5a4029">${esc(s.lead)}</p><span class="ver" style="color:var(--laranja-d);font-weight:800">Ver soluções →</span></a>`).join("");
  return head({ title: "Soluções por segmento | Massa Prima", desc: "Soluções da Massa Prima por tipo de negócio: padarias e pastelarias, hotelaria e restauração, produção industrial e revendedores.", canonical: url, jsonld: [breadcrumbLd(cb)] }) +
    `<main class="wrap">${crumbs(cb)}<h1>Soluções por segmento</h1><p class="lead" style="margin-bottom:18px">Produtos, receitas, formação e apoio técnico à medida do seu negócio.</p>${cards}</main>` + FOOT;
}

function buildSitemap() {
  const pages = ["/", "/catalogo.html", "/receitas.html", "/solucoes/", "/foodcost.html", "/cotacao.html", "/formacao", "/contactos/", "/privacidade.html", ...SEGMENTOS.map((s) => `/solucoes/${s.slug}/`)];
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
// JSON-LD dos hubs (id="ld-lista"): gerado dos dados reais, idempotente
function replaceLdLista(html, obj) {
  return html.replace(/(<script type="application\/ld\+json" id="ld-lista">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(obj)}$2`);
}
function injectInner(html, openRe, closeRe, inner) {
  // substitui o conteúdo entre a abertura e o fecho (idempotente)
  const re = new RegExp(`(${openRe})[\\s\\S]*?(${closeRe})`);
  return html.replace(re, `$1${inner}$2`);
}

// ---- BUILD ----
const changed = [];
if (!validateOnly) {
  // catalogo.html: #dados + pré-render #lista + JSON-LD ItemList
  let cat = read("catalogo.html");
  cat = replaceDados(cat, P);
  cat = injectInner(cat, '<div id="lista">', '</div><div class="empty" id="empty"', catalogCardsHTML());
  cat = replaceLdLista(cat, {
    "@context": "https://schema.org", "@type": "ItemList",
    name: "Catálogo Massa Prima — matérias-primas de panificação e pastelaria",
    url: `${SITE}/catalogo.html`, numberOfItems: P.length,
    itemListElement: P.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.nome, url: `${SITE}/catalogo/${p.slug}/` })),
  });
  fs.writeFileSync("catalogo.html", cat); changed.push("catalogo.html");

  // receitas.html: #dados + pré-render #grid + corrigir contagem "42 receitas" + JSON-LD ItemList de Recipe
  let rec = read("receitas.html");
  rec = replaceDados(rec, R);
  rec = injectInner(rec, '<div class="grid" id="grid">', "</div></main>", recipeCardsHTML());
  rec = rec.replace(/\b42 receitas\b/g, `${counts.receitas} receitas`);
  rec = replaceLdLista(rec, {
    "@context": "https://schema.org", "@type": "ItemList",
    name: "Receitas profissionais Massa Prima",
    url: `${SITE}/receitas.html`, numberOfItems: R.length,
    itemListElement: R.map((r, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Recipe", name: r.titulo, url: `${SITE}/receitas/${r.slug}/`, ...(r.foto ? { image: `${SITE}/${r.foto}` } : {}), ...(r.rend ? { recipeYield: r.rend } : {}) } })),
  });
  fs.writeFileSync("receitas.html", rec); changed.push("receitas.html");

  // homepage: contadores derivados dos dados (P0 — nunca hard-code; evita drift)
  try {
    let idx = read("index.html"); const before = idx;
    idx = idx.replace(/(data-count=")\d+(">0<\/div><div class="lbl">produtos)/, `$1${counts.produtos}$2`);
    idx = idx.replace(/(data-count=")\d+(">0<\/div><div class="lbl">receitas)/, `$1${counts.receitas}$2`);
    idx = idx.replace(/\b\d+( receitas profissionais)/g, `${counts.receitas}$1`);
    idx = idx.replace(/(as )\d+( receitas)/g, `$1${counts.receitas}$2`);
    if (idx !== before) { fs.writeFileSync("index.html", idx); changed.push("index.html (contadores)"); }
    // menções "NN receitas" nas descrições de receitas.html e formacao.html
    for (const f of ["receitas.html", "formacao.html"]) {
      let h = read(f); const b2 = h;
      h = h.replace(/\b\d+ receitas\b/g, `${counts.receitas} receitas`);
      if (h !== b2) { fs.writeFileSync(f, h); changed.push(`${f} (contador)`); }
    }
  } catch (_) {}

  // páginas individuais /catalogo/<slug>/ e /receitas/<slug>/
  let np = 0, nr = 0;
  for (const p of P) { fs.mkdirSync(`catalogo/${p.slug}`, { recursive: true }); fs.writeFileSync(`catalogo/${p.slug}/index.html`, productPage(p)); np++; }
  for (const r of R) { fs.mkdirSync(`receitas/${r.slug}`, { recursive: true }); fs.writeFileSync(`receitas/${r.slug}/index.html`, recipePage(r)); nr++; }
  changed.push(`${np} páginas de produto`, `${nr} páginas de receita`);

  // páginas de categoria
  for (const c of productCats) { const s = slugify(c); fs.mkdirSync(`catalogo/categoria/${s}`, { recursive: true }); fs.writeFileSync(`catalogo/categoria/${s}/index.html`, productCategoryPage(c)); }
  for (const c of recipeCats) { const s = slugify(c); fs.mkdirSync(`receitas/categoria/${s}`, { recursive: true }); fs.writeFileSync(`receitas/categoria/${s}/index.html`, recipeCategoryPage(c)); }
  changed.push(`${productCats.length}+${recipeCats.length} páginas de categoria`);

  // página de contactos
  fs.mkdirSync("contactos", { recursive: true }); fs.writeFileSync("contactos/index.html", contactosPage()); changed.push("contactos");

  // Soluções por segmento
  fs.mkdirSync("solucoes", { recursive: true }); fs.writeFileSync("solucoes/index.html", solucoesHub());
  for (const s of SEGMENTOS) { fs.mkdirSync(`solucoes/${s.slug}`, { recursive: true }); fs.writeFileSync(`solucoes/${s.slug}/index.html`, solucoesPage(s)); }
  changed.push(`soluções (${SEGMENTOS.length + 1})`);

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
