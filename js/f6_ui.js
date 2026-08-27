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
})();
