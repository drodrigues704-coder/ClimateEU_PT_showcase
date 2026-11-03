// ============================================================================
// F7_MAIN.JS — ponto de entrada: liga mapa, controlos, raster e gráfico.
// ============================================================================

(function () {
  // Última célula escolhida no mapa (ou null) — estado persistente: uma mudança
  // de indicador/cenário/período/região volta a pedir a série desta mesma
  // célula com o indicador novo (ver refresh() abaixo). Não é um 3º valor de
  // regionMode (f3_controls.js não sabe disto).
  let lastCell = null;
  const coordinateFormat = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const valueFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 });

  // A vista exata fica no endereço, para se poder partilhar. Valores por
  // omissão ficam de fora, para a ligação normal continuar limpa.
  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    const zoom = parseInt(params.get("z"), 10);
    return {
      indicator: params.get("ind"),
      scenario: params.get("cen"),
      period: params.get("per"),
      regionCode: params.get("reg"),
      basemap: params.get("mapa"),
      cellId: params.get("ponto"),
      view: isValidView(lat, lng, zoom) ? { lat, lng, zoom } : null,
    };
  }

  // Limites largos à volta de Portugal Continental: uma longitude absurda num
  // endereço faz o Leaflet tentar carregar infinitos tiles e parar a app.
  function isValidView(lat, lng, zoom) {
    return lat >= 34 && lat <= 45 && lng >= -13 && lng <= -3 && zoom >= 5 && zoom <= 19;
  }

  window.APP.syncUrl = function syncUrl() {
    const sel = window.APP.getSelection();
    const params = new URLSearchParams();
    if (sel.indicator !== Object.keys(window.APP.INDICATORS)[0]) params.set("ind", sel.indicator);
    if (sel.scenario !== "historico") {
      params.set("cen", sel.scenario);
      params.set("per", sel.period);
    }
    if (sel.nuts2Code) params.set("reg", sel.nuts2Code);
    if (window.APP.getBasemap() !== "dark") params.set("mapa", window.APP.BASEMAPS[window.APP.getBasemap()].param);
    if (lastCell) params.set("ponto", lastCell.id);

    const map = window.APP.map;
    const center = map.getCenter();
    const [homeLat, homeLng] = window.APP.PORTUGAL_CENTER;
    // Tolerância larga: o Leaflet arredonda o centro aos píxeis, e ao ajustar o
    // tamanho do mapa em arranque a vista inicial desloca-se uns milésimos.
    const isHomeView = map.getZoom() === window.APP.PORTUGAL_ZOOM && Math.abs(center.lat - homeLat) < 0.05 && Math.abs(center.lng - homeLng) < 0.05;
    if (!isHomeView) {
      params.set("lat", center.lat.toFixed(4));
      params.set("lng", center.lng.toFixed(4));
      params.set("z", map.getZoom());
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  };

  function formatCoordinates(cell) {
    const lat = `${coordinateFormat.format(Math.abs(cell.lat))}° ${cell.lat >= 0 ? "N" : "S"}`;
    const lng = `${coordinateFormat.format(Math.abs(cell.lng))}° ${cell.lng >= 0 ? "E" : "O"}`;
    return `${lat}, ${lng}`;
  }

  // Popup no ponto: o valor mostra-se onde se clicou, e em ecrãs estreitos
  // leva ao gráfico, que está noutro separador.
  function showCellPopup(cell, series, sel) {
    const value = sel.scenario === "historico" ? series.historico : series[sel.scenario][sel.period];
    const { label, unit } = window.APP.INDICATORS[sel.indicator];
    window.APP.openCellPopup(
      cell,
      `<strong>${label}</strong>
       <p class="popup-value">${valueFormat.format(value)} ${unit}</p>
       <p class="note">${window.APP.SCENARIO_LABELS[sel.scenario]}, ${window.APP.PERIOD_LABELS[sel.period]}. ${formatCoordinates(cell)}.</p>
       <button type="button" class="popup-charts">Ver gráfico</button>`
    );
  }

  async function main() {
    const urlState = readUrlState();
    window.APP.wireChrome();
    window.APP.initMap();
    if (urlState.view) {
      window.APP.map.setView([urlState.view.lat, urlState.view.lng], urlState.view.zoom, { animate: false });
    }
    // Depois de initMap(): setMobileTab (chamada dentro de wireMobileTabs)
    // já chama window.APP.map.invalidateSize(), precisa do mapa a existir.
    window.APP.wireMobileTabs();

    let catalog;
    try {
      const catalogRes = await fetch(`${window.APP.API_BASE}/catalog`);
      if (!catalogRes.ok) throw new Error(`catalog: HTTP ${catalogRes.status}`);
      catalog = await catalogRes.json();
      if (!catalog.color_scales) throw new Error("catalog: sem color_scales");
    } catch (err) {
      console.error(err);
      window.APP.showError("Não foi possível carregar os dados da aplicação. Verifica a ligação e recarrega a página.");
      return;
    }
    window.APP.COLOR_SCALES = catalog.color_scales;

    window.APP.populateControls(catalog.nuts2);
    window.APP.applySelection(urlState);
    const sharedBasemap = Object.keys(window.APP.BASEMAPS).find((key) => window.APP.BASEMAPS[key].param === urlState.basemap);
    if (sharedBasemap) {
      window.APP.setBasemap(sharedBasemap);
      document.getElementById("ctl-basemap").value = sharedBasemap;
    }

    const regionName = (code) => catalog.nuts2.find((region) => region.codigo === code)?.nuts2 ?? "Portugal Continental";
    let focusedCode;
    let keepViewOnce = urlState.view != null;
    let restoringCell = false;

    async function refresh() {
      const sel = window.APP.getSelection();
      const regionCode = sel.regionMode === "regiao" ? sel.nuts2Code : "nacional";
      const selectedRegionCode = sel.regionMode === "regiao" ? sel.nuts2Code : null;
      window.APP.map.closePopup();
      // Só muda a vista quando muda a região: trocar de indicador não pode
      // deitar fora o zoom em que se está.
      if (selectedRegionCode !== focusedCode) {
        window.APP.focusRegion(selectedRegionCode, keepViewOnce);
        focusedCode = selectedRegionCode;
      }
      keepViewOnce = false;
      window.APP.setRegionMask(selectedRegionCode);
      window.APP.syncUrl();

      const tasks = [
        window.APP.renderRaster(sel.indicator, sel.scenario, sel.period),
        window.APP.renderChart(sel.indicator, regionCode, regionName(selectedRegionCode)),
      ];
      // Painel 2 não depende de regionMode/scenario/period — só existe
      // depois de um clique no mapa, mas, a partir daí, segue o indicador
      // escolhido tal como o painel 1, sempre para a mesma célula.
      if (lastCell != null) {
        tasks.push(window.APP.renderChartForCell(sel.indicator, lastCell.id));
      }
      await Promise.all(tasks);
    }

    // Clique no mapa: preenche o painel 2 (#chart-panel-cell) com a série do
    // ponto para o indicador atual, sem tocar nos seletores nem no painel 1.
    window.APP.onCellClick(async (cell) => {
      // Sem popup ao restaurar de uma ligação: o seu autoPan mudaria a vista
      // partilhada.
      const showPopup = !restoringCell;
      lastCell = cell;
      document.getElementById("cell-location").textContent = formatCoordinates(cell);
      window.APP.syncUrl();
      const sel = window.APP.getSelection();
      const series = await window.APP.renderChartForCell(sel.indicator, cell.id);
      if (showPopup && series && lastCell === cell) showCellPopup(cell, series, sel);
    });

    document.getElementById("btn-cell-clear").addEventListener("click", () => {
      lastCell = null;
      window.APP.clearCellMarker();
      window.APP.clearCellChart();
      window.APP.syncUrl();
    });

    if (urlState.cellId) {
      const restoreCell = () => {
        restoringCell = true;
        window.APP.selectCellById(urlState.cellId);
        restoringCell = false;
      };
      if (window.APP.cellsIndex) restoreCell();
      else window.APP.onCellsReady(restoreCell);
    }

    // nuts2_display.geojson carrega de forma assíncrona (ver f2_map.js::initMap) —
    // se o utilizador mudar de região antes desse fetch terminar,
    // focusRegion/setRegionMask saem em silêncio (guarda de nuts2Layer) e
    // nada os volta a chamar até à próxima mudança de seletor. Reaplica a
    // seleção atual assim que a camada estiver pronta (achado do
    // code-reviewer) — sem refazer pedidos de raster/gráfico, só o
    // destaque/máscara do mapa, e sem mexer numa vista vinda do endereço.
    window.APP.onNuts2Ready(() => {
      const sel = window.APP.getSelection();
      const selectedRegionCode = sel.regionMode === "regiao" ? sel.nuts2Code : null;
      window.APP.focusRegion(selectedRegionCode, urlState.view != null || selectedRegionCode == null);
      window.APP.setRegionMask(selectedRegionCode);
    });

    // O aviso só sai numa mudança de seleção: limpá-lo no primeiro refresh
    // apagava os avisos de arranque (grelha de pontos ou limites por carregar).
    window.APP.onSelectionChange(() => {
      window.APP.hideError();
      return refresh();
    });
    window.APP.map.on("moveend", window.APP.syncUrl);
    await refresh();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
