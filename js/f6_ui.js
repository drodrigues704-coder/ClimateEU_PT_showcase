// ============================================================================
// F6_UI.JS — overlay de carregamento, banner de erro, modal "Sobre".
// ============================================================================

(function () {
  // Contador: vários pedidos correm em paralelo, e o primeiro a acabar não
  // pode esconder o indicador enquanto os outros continuam.
  let pendingRequests = 0;
  window.APP.showLoading = function showLoading() {
    pendingRequests += 1;
    document.getElementById("loading-overlay").hidden = false;
  };
  window.APP.hideLoading = function hideLoading() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) document.getElementById("loading-overlay").hidden = true;
  };

  // O aviso fica até ser fechado, ou até à próxima mudança de seleção.
  window.APP.showError = function showError(message) {
    document.getElementById("error-text").textContent = message;
    document.getElementById("error-banner").hidden = false;
  };
  window.APP.hideError = function hideError() {
    document.getElementById("error-banner").hidden = true;
  };

  function wireInfoModal() {
    const modal = document.getElementById("info-modal");
    const openButton = document.getElementById("btn-info");
    const closeButton = document.getElementById("btn-info-close");
    const close = () => {
      modal.hidden = true;
      openButton.focus();
    };
    openButton.addEventListener("click", () => {
      modal.hidden = false;
      closeButton.focus();
    });
    closeButton.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      // O botão de fechar é o único elemento focável: o foco não sai do diálogo.
      if (e.key === "Tab") e.preventDefault();
    });
  }

  window.APP.wireChrome = function wireChrome() {
    const basemapSelect = document.getElementById("ctl-basemap");
    Object.entries(window.APP.BASEMAPS).forEach(([key, { label }]) => basemapSelect.add(new Option(label, key)));
    basemapSelect.addEventListener("change", () => {
      window.APP.setBasemap(basemapSelect.value);
      window.APP.syncUrl();
    });
    wireInfoModal();
    document.getElementById("btn-error-close").addEventListener("click", window.APP.hideError);

    const summaryButton = document.getElementById("btn-map-summary");
    summaryButton.addEventListener("click", () => {
      const legend = document.getElementById("map-legend");
      legend.hidden = !legend.hidden;
      summaryButton.setAttribute("aria-expanded", String(!legend.hidden));
    });

    // O botão vem dentro do popup do Leaflet, criado depois deste arranque.
    document.addEventListener("click", (e) => {
      if (e.target.closest(".popup-charts")) window.APP.setMobileTab("graficos");
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
      if (active) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
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
