// ============================================================================
// F7_MAIN.JS — ponto de entrada: liga mapa, controlos, raster e gráfico.
// ============================================================================

(function () {
  // Último cellId clicado no mapa (ou null, se ainda nenhum clique
  // aconteceu) — estado persistente, ao contrário do antigo `cellOverride`
  // que o refresh() limpava a cada mudança de controlo. Painel 2
  // (#chart-panel-cell) é agora independente do painel 1: uma mudança de
  // indicador/cenário/período/região não o esvazia — antes pelo contrário,
  // volta a pedir a série desta mesma célula com o indicador novo (ver
  // refresh() abaixo). Não é um 3º valor de regionMode (f3_controls.js não
  // sabe disto).
  let lastCellId = null;

  async function main() {
    window.APP.wireChrome();
    window.APP.initMap();
    // Depois de initMap(): setMobileTab (chamada dentro de wireMobileTabs)
    // já chama window.APP.map.invalidateSize(), precisa do mapa a existir.
    window.APP.wireMobileTabs();

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
      const selectedRegionCode = sel.regionMode === "regiao" ? sel.nuts2Code : null;
      window.APP.focusRegion(selectedRegionCode);
      window.APP.setRegionMask(selectedRegionCode);

      const tasks = [
        window.APP.renderRaster(sel.indicator, sel.scenario, sel.period),
        window.APP.renderChart(sel.indicator, regionCode),
      ];
      // Painel 2 não depende de regionMode/scenario/period — só existe
      // depois de um clique no mapa, mas, a partir daí, segue o indicador
      // escolhido tal como o painel 1, sempre para a mesma célula.
      if (lastCellId != null) {
        tasks.push(window.APP.renderChartForCell(sel.indicator, lastCellId));
      }
      await Promise.all(tasks);
    }

    // Clique numa célula da grelha ClimateEU: preenche o painel 2
    // (#chart-panel-cell) com a série dessa célula para o indicador atual,
    // sem tocar em regionMode nem nos outros seletores nem no painel 1.
    window.APP.onCellClick(async (cellId) => {
      lastCellId = cellId;
      const sel = window.APP.getSelection();
      await window.APP.renderChartForCell(sel.indicator, lastCellId);
    });

    // nuts2.geojson carrega de forma assíncrona (ver f2_map.js::initMap) —
    // se o utilizador mudar para "Esta região" antes desse fetch terminar,
    // focusRegion/setRegionMask saem em silêncio (guarda de nuts2Layer) e
    // nada os volta a chamar até à próxima mudança de seletor. Reaplica a
    // seleção atual assim que a camada estiver pronta (achado do
    // code-reviewer) — sem refazer pedidos de raster/gráfico, só o
    // destaque/máscara do mapa.
    window.APP.onNuts2Ready(() => {
      const sel = window.APP.getSelection();
      const selectedRegionCode = sel.regionMode === "regiao" ? sel.nuts2Code : null;
      window.APP.focusRegion(selectedRegionCode);
      window.APP.setRegionMask(selectedRegionCode);
    });

    window.APP.onSelectionChange(refresh);
    await refresh();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
