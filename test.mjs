// ============================================================================
//  TESTES — massaprima.com   (node test.mjs)   corre após `node build.mjs`
//  Valida: schema dos dados · matemática do food cost · sitemap→ficheiro ·
//          links internos das páginas geradas · contadores da homepage.
// ============================================================================
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log("  ✗ " + msg); } };
const read = (f) => fs.readFileSync(f, "utf8");
const exists = (f) => { try { return fs.existsSync(f); } catch { return false; } };

// ── 1. Dados ────────────────────────────────────────────────────────────────
const P = JSON.parse(read("data/products.json"));
const R = JSON.parse(read("data/recipes.json"));
console.log("1. Dados");
ok(P.length === 88, `88 produtos (obtido ${P.length})`);
ok(R.length === 88, `88 receitas (obtido ${R.length})`);
ok(new Set(P.map((p) => p.slug)).size === P.length, "slugs de produto únicos");
ok(new Set(R.map((r) => r.slug)).size === R.length, "slugs de receita únicos");
ok(P.every((p) => p.nome && p.segmento && p.formatos), "produtos com campos obrigatórios");
ok(R.every((r) => r.titulo && r.cat && r.foto), "receitas com campos obrigatórios");

// ── 2. Matemática do food cost ───────────────────────────────────────────────
console.log("2. Food cost (fórmula)");
function foodCost({ ing, un, desp = 0, ind = 0, emb = 0, mo = 0, out = 0 }) {
  const total = ing.reduce((a, [, g], i) => a + (g / 1000) * (Array.isArray(ing[i]) ? ing[i][2] || 0 : 0), 0);
  const ingr = total * (1 + desp / 100);
  const totalG = ingr * (1 + ind / 100) + (emb + mo + out) * un;
  return totalG / un;
}
// caso base: 1000 g @ 1000 Kz/kg = 1000 Kz, 10 un → 100/un
ok(Math.round(foodCost({ ing: [["x", 1000, 1000]], un: 10 })) === 100, "custo base 100/un");
ok(Math.round(foodCost({ ing: [["x", 1000, 1000]], un: 10, ind: 10 })) === 110, "indiretos 10% → 110/un");
ok(Math.round(foodCost({ ing: [["x", 1000, 1000]], un: 10, desp: 10, ind: 10 })) === 121, "desperdício+indiretos → 121/un");
ok(Math.round(foodCost({ ing: [["x", 1000, 1000]], un: 10, mo: 5, out: 5 })) === 110, "mão de obra+outros/un → 110/un");

// ── 3. Sitemap → ficheiro existe ─────────────────────────────────────────────
console.log("3. Sitemap");
const resolve = (u) => {
  let path = u.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
  if (path === "/formacao") return "formacao.html";               // rewrite netlify.toml
  if (path === "/" || path === "") return "index.html";
  if (path.endsWith("/")) return path.slice(1) + "index.html";
  if (/\.[a-z0-9]+$/i.test(path)) return path.slice(1);
  return path.slice(1) + "/index.html";
};
const sm = read("sitemap.xml");
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok(locs.length >= 189, `sitemap com ≥189 URLs (obtido ${locs.length})`);
let smMiss = 0;
for (const u of locs) { if (!exists(resolve(u))) { smMiss++; if (smMiss <= 5) console.log("  ✗ sitemap sem ficheiro: " + u + " → " + resolve(u)); } }
ok(smMiss === 0, `todas as URLs do sitemap têm ficheiro (faltam ${smMiss})`);

// ── 4. Links internos das páginas geradas ────────────────────────────────────
console.log("4. Links internos");
function pagesIn(dir) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (e.name === "index.html") out.push(p); } };
  if (exists(dir)) walk(dir);
  return out;
}
const gen = [...pagesIn("catalogo"), ...pagesIn("receitas")];
ok(gen.length >= 182, `páginas geradas ≥182 (obtido ${gen.length})`);
let linkMiss = 0, checked = 0;
const skip = (h) => !h || h.startsWith("http") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("#") || h.startsWith("data:");
for (const f of gen) {
  const html = read(f);
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const h = m[1];
    if (skip(h) || !h.startsWith("/")) continue;      // só links root-absolutos internos
    checked++;
    if (!exists(resolve(h))) { linkMiss++; if (linkMiss <= 8) console.log(`  ✗ link partido em ${f}: ${h}`); }
  }
}
ok(linkMiss === 0, `sem links internos partidos (${linkMiss} de ${checked} verificados)`);

// ── 5. Contadores da homepage = dados ────────────────────────────────────────
console.log("5. Homepage");
const idx = read("index.html");
const prod = (idx.match(/data-count="(\d+)">0<\/div><div class="lbl">produtos/) || [])[1];
const rec = (idx.match(/data-count="(\d+)">0<\/div><div class="lbl">receitas/) || [])[1];
ok(+prod === P.length, `contador de produtos = ${P.length} (homepage diz ${prod})`);
ok(+rec === R.length, `contador de receitas = ${R.length} (homepage diz ${rec})`);
ok(!/\b42 receitas\b/.test(read("receitas.html")), "receitas.html sem '42 receitas'");

// ── Resumo ───────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
