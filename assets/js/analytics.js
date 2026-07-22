// ============================================================================
//  Camada de analytics da Massa Prima — consent-aware, IDs por configuração.
//  NUNCA inventar IDs: GA4/GTM ficam vazios até serem fornecidos em window.MP_CFG.
//  O Meta Pixel (1556990136150680) já está nas páginas de conversão.
//
//  API: window.mpTrack(evento, props)
//  Eventos previstos: page_view, view_product, view_recipe, search_catalog,
//    filter_catalog, add_to_quote, remove_from_quote, begin_quote, submit_quote,
//    quote_success, quote_error, calculate_food_cost, print_food_cost,
//    request_demo, phone_click, email_click, chef_prima_open, chef_prima_question.
// ============================================================================
(function () {
  var CFG = window.MP_CFG || {};
  var DEBUG = !!CFG.debug || /[?&]mpdebug=1/.test(location.search);
  window.dataLayer = window.dataLayer || [];

  function consent() {
    try { return localStorage.getItem("mp-consent") !== "deny"; } catch (_) { return true; }
  }

  function track(event, props) {
    props = props || {};
    var payload = { event: event };
    for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) payload[k] = props[k];
    try { window.dataLayer.push(payload); } catch (_) {}
    if (DEBUG) { try { console.log("[mpTrack]", event, props); } catch (_) {} }
    if (!consent()) return;
    // Meta Pixel: só eventos de conversão relevantes (evita duplicar PageView)
    if (typeof window.fbq === "function" && (event === "submit_quote" || event === "quote_success" || event === "request_demo")) {
      try { window.fbq("trackCustom", event, props); } catch (_) {}
    }
    // GA4 via gtag, apenas se configurado
    if (CFG.ga4 && typeof window.gtag === "function") {
      try { window.gtag("event", event, props); } catch (_) {}
    }
  }
  window.mpTrack = track;

  document.addEventListener("DOMContentLoaded", function () {
    track("page_view", { path: location.pathname });
    var m;
    if ((m = location.pathname.match(/^\/catalogo\/(?!categoria\/)([^\/]+)\/?$/))) track("view_product", { slug: m[1] });
    else if ((m = location.pathname.match(/^\/receitas\/(?!categoria\/)([^\/]+)\/?$/))) track("view_recipe", { slug: m[1] });
  });

  // cliques globais de contacto (sem WhatsApp, por decisão de marca)
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("mailto:") === 0) track("email_click", { to: href.slice(7, 60) });
    else if (href.indexOf("tel:") === 0) track("phone_click", { to: href.slice(4, 30) });
  }, true);
})();
