// ============================================================================
// F7_MAIN.JS — ponto de entrada: liga mapa, controlos, raster e gráfico.
// ============================================================================

(function () {
  async function main() {
    window.APP.wireChrome();
    window.APP.initMap();

    let catalog;
    try {
      const catalogRes = await fetch(`${window.APP.API_BASE}/catalog`);
      if (!catalogRes.ok) {
        window.APP.showError("Não foi possível carregar o catálogo — o pipeline já correu? (data/catalog.json)");
        return;
      }
      catalog = await catalogRes.json();
    } catch (err) {
      window.APP.showError("Não foi possível ligar ao servidor — confirma que o backend está a correr.");
      return;
    }

    window.APP.populateControls(catalog.nuts2);

    async function refresh() {
      const sel = window.APP.getSelection();
      const regionCode = sel.regionMode === "regiao" ? sel.nuts2Code : "nacional";
      await Promise.all([
        window.APP.renderRaster(sel.indicator, sel.scenario, sel.period),
        window.APP.renderChart(sel.indicator, regionCode),
      ]);
    }

    window.APP.onSelectionChange(refresh);
    await refresh();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
