# CHANGELOG — massaprima.com

Auditoria + melhoria profunda do site (Lead Product Design · UX Conversion · SEO Technical · Full-Stack).
Trabalho por fases, **preservando identidade, logótipo, paleta e as secções fortes**. Diagnóstico inicial em [`AUDIT.md`](AUDIT.md).

> **Estado:** tudo em commits **locais** (7), **ainda não publicado** — por decisão de publicar só no fim. Pronto para um push único após validação.

---

## 1. Arquitetura nova (fonte de verdade única + build)
- **`data/products.json`** (88) e **`data/recipes.json`** (88) — fonte de verdade única, com `slug`.
- **`build.mjs`** (`npm run build`) — valida o schema, **deriva os contadores**, sincroniza o `#dados` das páginas, **pré-renderiza o conteúdo no HTML** e gera as páginas individuais + categorias + sitemap. Output estático (o Netlify serve como está).
- Regra nova: editar produtos/receitas = editar `data/*.json` → `node build.mjs`. **Não** editar o `#dados` à mão.

## 2. Erros corrigidos
- **Conteúdo só existia via JavaScript** (catálogo/receitas com 0 cards no HTML) → agora **88+88 cards no HTML inicial**, indexável e funcional sem JS.
- **Número inconsistente:** `receitas.html` dizia **"42 receitas"** → **88** (agora derivado dos dados).
- **FT do Creme Pasteleiro Sublime** com os "Aparelhos" dos recheios baralhados (reportado pelo Hugo) → reorganizados sob cada aparelho (sem alterar valores); herdado na página individual e no Chef Prima.
- **Contadores da homepage** passam a ser derivados dos dados (nunca hard-code).
- Evitado partir o `foodcost.html` (usa dataset derivado próprio) — não é tocado pelo build.

## 3. Páginas criadas
- **88** páginas de produto `/catalogo/<slug>/` — ficha completa, breadcrumbs, dosagem, aplicações, ingredientes, alergénios, nutrição, conservação, imprimir, receitas + produtos relacionados, CTAs.
- **88** páginas de receita `/receitas/<slug>/` — ingredientes, método, produtos usados (com link), dica, food cost, imprimir, relacionadas.
- **6** páginas de categoria `/catalogo/categoria/…` (2) e `/receitas/categoria/…` (4).
- Total: **182 páginas novas indexáveis** + `sitemap.xml` com **189 URLs**.

## 4. Melhorias SEO
- Páginas individuais e de categoria **reais e partilháveis** (antes só modais).
- **JSON-LD**: Product, Recipe, CollectionPage, BreadcrumbList (só conteúdo visível).
- Breadcrumbs, `lang="pt-AO"`, `<title>`/description/canonical/OG por página, sitemap com todas as URLs.
- **`netlify.toml`**: rota canónica `/formacao` (+301 de `/formacao.html`), `/api/*`→Chef Prima, security headers, cache de assets.

## 5. Melhorias de conversão
- **Carrinho de cotação persistente** (localStorage) entre páginas; **prefill** a partir das fichas (`?produto=` / `?produtos=`); **referência** `MP-AAAAMMDD-XXXX` + agradecimento; **anti-duplo-envio**; captura de **UTMs/origem** no pedido.
- Fichas ligam à cotação e ao food cost; cards ligam às páginas individuais.
- **Food cost rigoroso**: custos discriminados (desperdício, embalagem, mão de obra, transporte, custos fixos), **3 cenários** (25/30/35%), disclaimer de estimativa, mensagem "<25%" reescrita (equilibrada).

## 6. Analytics (medição)
- **`assets/js/analytics.js`** consent-aware: `mpTrack()` → `dataLayer` + ponte `fbq`/`gtag`. Eventos: page_view, view_product, view_recipe, begin_quote, add_to_quote, remove_from_quote, submit_quote, quote_success, quote_error, email_click, phone_click. Debug via `?mpdebug=1`.

## 7. Testes executados (`npm test`)
- `test.mjs` — **17 asserts, todos a passar**: schema dos dados, matemática do food cost (4 casos), sitemap→ficheiro (189), links internos das páginas geradas (0 partidos), contadores da homepage = dados.

## 8. Variáveis de ambiente / configuração necessárias
- **Analytics:** `window.MP_CFG = { ga4:"", gtm:"" }` nas páginas — preencher com o ID GA4/GTM real quando existir (hoje vazios; nada inventado).
- **Chef Prima (Netlify Function):** já usa o AI Gateway da Netlify; sem chave no frontend.
- **Netlify:** `netlify.toml` só tem efeito no deploy — **validar num preview** (redirects `/formacao`, `/api/*`, headers).

## 9. Integrações pendentes
- Publicar (push único) + verificar `netlify.toml` no preview antes de promover a produção.
- GA4/GTM: fornecer ID para ativar os eventos além do Pixel.
- WebP/AVIF das imagens (ver §11).

## 10. ⚠️ Dados que precisam de validação humana (nada inventado)
- **Meta Pixel:** o ID real nas páginas é **`930726976710021`**; a skill/documentação tinha `1556990136150680` (desatualizado). **Confirmar qual é o correto.**
- **WhatsApp:** mantido **SEM WhatsApp** (regra de marca; não há número). Se quiserem ativar, fornecer o número oficial.
- **E-mail de marca:** atual `geral@quenteebom.co.ao`. Confirmar se há caixa `@massaprima.com` para o remetente.
- **Fotos "Feito em Angola":** usar só imagens reais aprovadas (não gerar pessoas/instalações que passem por foto real da empresa).
- **Telefone/morada/horário** para a área de contactos/confiança: confirmar e centralizar.

## 11. Resumo por prioridade
**✅ Concluído (P0–P2):** fonte única + build; conteúdo no HTML; contadores derivados; 182 páginas + categorias + sitemap + JSON-LD; carrinho de cotação persistente + fluxo; food cost rigoroso; analytics consent-aware; `netlify.toml`; suite de testes (17/17).

**⏳ Pendente por falta de dados/decisão:** ID GA4/GTM; confirmação do Pixel; e-mail `@massaprima.com`; área de contactos/confiança (telefone/morada/horário); WebP.

**🔭 Recomendações futuras:** WebP/AVIF + `width`/`height` explícitos em todas as imagens (CLS/performance); CSP calibrada (testar em preview); página `/contactos` dedicada com dados legais centralizados num único ficheiro de config; wiring dos restantes eventos (request_demo na formação, calculate_food_cost, chef_prima_*); Lighthouse em produção (metas: Perf ≥90, A11y ≥95, BP ≥95, SEO ≥95).

---
*Homepage preservada (já forte e alinhada com o brief: hero claro, barra de prova com 4 métricas reais, Escola consolidada, CTA final). Sem redesign desnecessário.*
