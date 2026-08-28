// ============================================================================
// F6_UI.JS — overlay de carregamento, banner de erro, modal "Sobre".
// ============================================================================

(function () {
  window.APP.showLoading = function showLoading() {
    document.getElementById("loading-overlay").hidden = false;
  };
  window.APP.hideLoading = function hideLoading() {
    document.getElementById("loading-overlay").hidden = true;
  };
  window.APP.showError = function showError(message) {
    const banner = document.getElementById("error-banner");
    banner.textContent = message;
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 6000);
  };

  window.APP.wireChrome = function wireChrome() {
    document.getElementById("btn-basemap").addEventListener("click", () => {
      const key = window.APP.toggleBasemap();
      document.getElementById("btn-basemap").textContent = key === "dark" ? "🗺 Mapa: Escuro" : "🗺 Mapa: Claro";
    });
    document.getElementById("btn-info").addEventListener("click", () => {
      document.getElementById("info-modal").hidden = false;
    });
    document.getElementById("btn-info-close").addEventListener("click", () => {
      document.getElementById("info-modal").hidden = true;
    });
  };

  // ==========================================================================
  // Navegação por separadores fixos (mobile, abaixo do breakpoint em
  // CSS/style.css — ver #mobile-tabs). Acima do breakpoint estes botões
  // ficam display:none e nada disto tem efeito visível; corre sempre na
  // mesma (não há deteção de largura aqui) porque é a CSS que decide se a
  // barra aparece, não o JS.
  // ==========================================================================
  window.APP.setMobileTab = function setMobileTab(tab) {
    document.body.setAttribute("data-mobile-tab", tab);
    document.querySelectorAll("#mobile-tabs .mobile-tab").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    // Armadilha clássica do Leaflet: um L.Map criado (ou já existente)
    // dentro de um contentor que estava display:none guarda o tamanho
    // errado (0×0, ou o tamanho de antes de esconder) e não o recalcula
    // sozinho quando o contentor volta a ficar visível — tiles cortados/
    // desalinhados até haver um resize ou pan manual. invalidateSize()
    // tem de correr depois do browser já ter aplicado o novo `display`
    // (por isso requestAnimationFrame, não uma chamada síncrona logo a
    // seguir a mudar o atributo) — sem isto o Leaflet ainda mede o
    // contentor escondido (altura/largura 0) e invalidateSize() não tem
    // efeito nenhum.
    if (tab === "mapa") {
      requestAnimationFrame(() => {
        if (window.APP.map) window.APP.map.invalidateSize();
      });
    }

    // Achado real (Playwright, não assumido): ao contrário do que seria de
    // esperar, o ResizeObserver interno do Chart.js (v4, responsive:true
    // por omissão) NÃO corrige sozinho este caso. O painel "Gráficos" só
    // fica visível depois do 1º refresh() (f7_main.js) já ter desenhado o
    // gráfico da região com o separador "Mapa" ainda ativo — nessa altura
    // o canvas de #chart-series está dentro de um #chart-column
    // display:none, o Chart.js mede o contentor a 0×0 e grava esse
    // tamanho no width/height inline do próprio <canvas>. Esse inline
    // style fica preso em "0px" mesmo depois de #chart-column voltar a
    // ficar visível (confirmado por inspeção do DOM: getBoundingClientRect
    // do canvas continuava 0×0 mesmo com o .chart-wrap à volta já com o
    // tamanho real) — sem mais nenhum evento a acordar o observer, o
    // gráfico fica invisível (canvas 0×0) até algo mexer na janela.
    // chart.resize() força a nova medição e corrige o inline style; por
    // isso deixa de ser "rede de segurança", passa a ser necessário.
    if (tab === "graficos" && window.APP.resizeCharts) {
      requestAnimationFrame(() => window.APP.resizeCharts());
    }
  };

  window.APP.wireMobileTabs = function wireMobileTabs() {
    document.querySelectorAll("#mobile-tabs .mobile-tab").forEach((btn) => {
      btn.addEventListener("click", () => window.APP.setMobileTab(btn.dataset.tab));
    });
    // Sincroniza o estado inicial dos botões com o atributo já definido no
    // HTML (<body data-mobile-tab="mapa">) e garante o invalidateSize()
    // inicial do mapa — initMap() já correu antes desta chamada (ver
    // f7_main.js), mas o mapa foi criado com o painel "mapa" já visível
    // por omissão, por isso este primeiro invalidateSize() é só uma rede
    // de segurança, não uma correção de um tamanho errado conhecido.
    window.APP.setMobileTab(document.body.getAttribute("data-mobile-tab") || "mapa");
  };
})();
