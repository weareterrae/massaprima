# AUDIT — massaprima.com (auditoria inicial, 2026-07-18)

> Relatório de inspeção **antes de implementar** (passos 1–9 do brief). Nada de código foi alterado ainda.
> Perfis: Lead Product Designer · UX Conversion · SEO Technical Lead · Senior Full-Stack.

## 1. Stack e arquitetura (o que realmente existe)

| Item | Estado |
|---|---|
| Framework / build | **Nenhum.** Sem `package.json`, `netlify.toml`, `_redirects`, `vite/next/astro`. HTML/CSS/JS escritos à mão. |
| Hosting | **Netlify** (domínio massaprima.com). Deploy: `git push` → Netlify. Raiz do repo git = a pasta `Site/`. |
| Páginas | `index`, `catalogo`, `receitas`, `foodcost`, `cotacao`, `formacao`, `privacidade`, `inbox`, `404`, + verificação Google. |
| Dados | JSON **embebido** em `<script id="dados">` dentro de `catalogo.html` (**88 produtos**) e `receitas.html` (**88 receitas**); `foodcost.html` tem cópia própria; `prima-prompt.txt` é gerado. **Não há fonte de verdade única versionada.** Os geradores node (`build_prompt2.js`, etc.) vivem no scratchpad — **não estão no repo**. |
| Renderização | 100% **client-side**: `curl` ao catálogo devolve **0 cards** no HTML. Sem JS → catálogo/receitas vazios. |
| Chef Prima | **Funcional** (não é simulação): Netlify Function `netlify/functions/chef-prima.mjs`, chamada via `/api/chef-prima` (`assets/js/chefprima.js`), com plano B (Gemini) recente. Lê o cérebro de `massaprima.com/prima-prompt.txt`. |
| Formulários | **Netlify Forms** reais: `cotacao` (cotacao.html), `demonstracao` (formacao.html), `contacto` (index.html) — markup `data-netlify` presente. |

## 2. P0 — problemas de dados/render (CONFIRMADOS com evidência)

1. **Conteúdo só existe via JavaScript.** HTML servido tem **0 `class="card"`**. Consequências: quebra sem JS, risco de "flash" de estado vazio no arranque, e os motores/leitores só veem o JSON no `<script>`, não os produtos renderizados. → precisa de **pré-render/SSG**.
2. **Números inconsistentes (real):** `receitas.html` diz **"42 receitas"** no cabeçalho, mas há **88**. `index.html` e `formacao.html` dizem 88 (certo). Produtos = 88 em todo o lado (certo). Contagens **hardcoded** → têm de ser derivadas dos dados.
3. **Sem fonte de verdade única:** dados duplicados entre `catalogo.html`, `receitas.html`, `foodcost.html`, `prima-prompt.txt`. Alterar um número obriga a tocar em vários sítios (foi como o "42" ficou para trás).
4. **Sem `slug`:** produtos e receitas têm só `id`. Não existem páginas individuais (`/catalogo/[slug]`, `/receitas/[slug]`) — só painel off-canvas/modal.
5. **Contadores animados:** `index.html` usa `data-count="88"` (×2) — o valor real ESTÁ no HTML (bom para a11y/crawler), mas confirmar que não arranca visualmente a 0 sem JS.

*Nota:* os suspeitos `<\div>` / `\ chips` **não são bugs** — eram artefactos de visualização; os bytes reais são `</div>` e `// chips`. O JS do catálogo está íntegro.

## 3. Conteúdo real (para derivar contadores — nunca hardcode)
- **Produtos: 88** — Padaria 21 · Pastelaria 67 · (Massa Prima 34 · Prodite Zeelandia 54). Campo `publicado`: inexistente (assumir todos publicados).
- **Receitas: 88** — Pão 16 · Bolos & Tortas 18 · Vitrine & Café 22 · Tradicional & Festas 32.

## 4. SEO / rotas
- Tem: canonical, OG/Twitter, `robots.txt`, `sitemap.xml`, `404.html`, favicon, JSON-LD Organization (index).
- Falta: **páginas individuais indexáveis** (produto/receita), páginas de categoria, **redirects** (`/formacao.html` → `/formacao`; `/api/*`), JSON-LD **Product/Recipe/BreadcrumbList**, `lang="pt-AO"` (está `pt`), breadcrumbs.
- Sem `netlify.toml`/`_redirects` no repo → a rota `/api/chef-prima` depende de config no painel Netlify (⚠️ **verificar** que o redirect existe, senão o Chef Prima parte).

## 5. Conversão / UX
- Cotação, Formação e Contacto funcionam (Netlify Forms), mas: sem **carrinho de cotação persistente** entre páginas, sem página de agradecimento com referência, sem prevenção de duplo-envio explícita, sem estados de erro ricos.
- Food cost: simples e bom; falta rigor (embalagem, desperdício, mão de obra, cenários 25/30/35, aviso de estimativa). Rever a frase "<25% pode significar que está a cobrar demasiado" (tecnicamente frágil).

## 6. ⚠️ Conflitos e dados em falta (decisão humana — NÃO inventar)
- **WhatsApp:** o brief pede botões WhatsApp; a **regra de marca atual é SEM WhatsApp** (contacto único geral@quenteebom.co.ao) e **não existe número**. → confirmar com o Sandro + fornecer número, senão omitir. Nunca inventar número.
- **Email de marca:** brief prefere email `@massaprima.com`; atual é `geral@quenteebom.co.ao`. → confirmar se existe caixa no domínio massaprima.com.
- **Analytics:** só Pixel `1556990136150680` (PageView + Lead). Os ~20 eventos pedidos (view_product, add_to_quote, etc.) e GA4/GTM não existem. → implementar camada consent-aware com **IDs via variáveis de ambiente** (não inventar IDs).
- **Fotos "Feito em Angola":** usar só imagens reais aprovadas; não gerar pessoas/instalações que passem por fotografia real da empresa.

## 7. Decisão de arquitetura recomendada (razão técnica forte = P0)
Introduzir um **passo de build SSG leve** (script Node próprio ou Eleventy/Astro) que:
- lê **uma fonte de verdade** versionada (`data/products.json` + `data/recipes.json`, tipada/validada no build);
- **gera HTML estático** para todas as páginas + páginas individuais (`/catalogo/<slug>`, `/receitas/<slug>`) e de categoria, com conteúdo já no HTML (funciona sem JS, indexável);
- deriva **todos os contadores** dos dados;
- valida o schema no build (um produto inválido não parte o catálogo);
- mantém o **output estático para Netlify** e **preserva o design/identidade atuais** (sem framework no cliente).

Isto respeita "conforme a stack existente" (continua estático) e é a mudança **mínima** que satisfaz os critérios de aceitação P0. Sem isto, é impossível ter conteúdo no HTML inicial + fonte única + URLs por item.

## 8. Plano por prioridade (proposto)
- **P0:** fonte única de dados + build SSG + render no HTML + contadores derivados + estados loading/erro/vazio + corrigir "42→88".
- **P1:** páginas individuais (produto/receita) + categorias + breadcrumbs + JSON-LD Product/Recipe + carrinho de cotação persistente + fluxo de cotação com agradecimento/referência.
- **P2:** food cost rigoroso + eventos de analytics (env) + performance/imagens (WebP, lazy, dimensões) + a11y sweep + security headers (`netlify.toml`) + testes (lint/typecheck/unit food cost/rotas/redirects).
- **P3:** consistência visual/copy, `/formacao` + redirect, contactos/confiança, CHANGELOG.

## 9. Estado dos critérios de aceitação (antes de implementar)
Cumpridos: nenhum dos 20 ainda (baseline). Bloqueios de dados humanos: #WhatsApp, email de marca, IDs de analytics, fotos reais.
