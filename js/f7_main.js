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
    const zoom = parseFloat(params.get("z"));
    return {
      indicator: params.get("ind"),
      scenario: params.get("cen"),
      period: params.get("per"),
      regionCode: params.get("reg"),
      basemap: params.get("mapa"),
      cellId: params.get("ponto"),
      compare: params.get("cmp"),
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
    const compare = window.APP.getCompareParam();
    if (compare) params.set("cmp", compare);

    const map = window.APP.map;
    const center = map.getCenter();
    if (!window.APP.isHomeView()) {
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

  // O valor no mapa, sem ter de ir ao gráfico, que em ecrãs estreitos está
  // noutro separador.
  function showCellCard(cell, series, sel) {
    const value = sel.scenario === "historico" ? series.historico : series[sel.scenario][sel.period];
    const { label, unit } = window.APP.INDICATORS[sel.indicator];
    window.APP.showCellCard(
      `<button type="button" class="cell-card-close" aria-label="Fechar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
       <strong>${label}</strong>
       <p class="cell-card-value">${valueFormat.format(value)} ${unit}</p>
       <p class="note">${window.APP.SCENARIO_LABELS[sel.scenario]}, ${window.APP.PERIOD_LABELS[sel.period]}. ${formatCoordinates(cell)}.</p>
       <button type="button" class="cell-card-charts">Ver gráfico</button>`
    );
  }

  const normalizeName = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Pesquisa de concelhos: leva o mapa até lá e consulta o ponto mais próximo. Um
  // concelho fora da região selecionada volta à vista de Portugal Continental.
  async function wirePlaceSearch() {
    const input = document.getElementById("ctl-place");
    const status = document.getElementById("place-status");
    let places = [];
    try {
      places = await (await fetch("data/concelhos.json")).json();
    } catch (err) {
      console.error(err);
      status.textContent = "Não foi possível carregar a lista de concelhos.";
      return;
    }
    const collator = new Intl.Collator("pt-PT");
    places.sort((a, b) => collator.compare(a[0], b[0]));
    const list = document.getElementById("place-list");
    places.forEach(([name]) => list.appendChild(new Option(name)));

    const go = () => {
      const query = normalizeName(input.value);
      if (!query) return;
      const place = places.find(([name]) => normalizeName(name) === query) || places.find(([name]) => normalizeName(name).startsWith(query));
      if (!place) {
        status.textContent = `Não encontrei "${input.value}". Escreve o nome de um concelho de Portugal Continental.`;
        return;
      }
      const [name, lat, lng] = place;
      const cell = window.APP.nearestCellAnywhere(lat, lng);
      const { nuts2Code } = window.APP.getSelection();
      if (nuts2Code && cell && cell.codigo !== nuts2Code) {
        const national = document.querySelector('input[name="region-mode"][value="nacional"]');
        national.checked = true;
        national.dispatchEvent(new Event("change"));
      }
      window.APP.map.setView([lat, lng], Math.max(window.APP.map.getZoom(), 10), { animate: false });
      if (cell) window.APP.selectCellById(cell.id);
      input.value = name;
      status.textContent = `A mostrar ${name}.`;
      document.getElementById("cell-location").textContent = `${name}: ${document.getElementById("cell-location").textContent}`;
      // Em ecrãs estreitos os controlos estão noutro separador.
      window.APP.setMobileTab("mapa");
    };
    input.addEventListener("change", go);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
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
    window.APP.NUTS2_REGIONS = catalog.nuts2;
    document.getElementById("btn-csv").disabled = false;

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

    async function refresh() {
      const sel = window.APP.getSelection();
      const regionCode = sel.regionMode === "regiao" ? sel.nuts2Code : "nacional";
      const selectedRegionCode = sel.regionMode === "regiao" ? sel.nuts2Code : null;
      // Um ponto de outra região deixaria de se ver: a consulta acaba aqui.
      if (lastCell && selectedRegionCode != null && lastCell.codigo !== selectedRegionCode) clearCell();
      // Só muda a vista quando muda a região: trocar de indicador não pode
      // deitar fora o zoom em que se está.
      if (selectedRegionCode !== focusedCode) {
        window.APP.focusRegion(selectedRegionCode, keepViewOnce);
        focusedCode = selectedRegionCode;
      }
      keepViewOnce = false;
      window.APP.setRegionClip(selectedRegionCode);
      window.APP.updateCompare();
      window.APP.syncUrl();

      const tasks = [
        window.APP.renderRaster(sel.indicator, sel.scenario, sel.period),
        window.APP.renderChart(sel.indicator, regionCode, regionName(selectedRegionCode)),
      ];
      // Painel 2 não depende de regionMode/scenario/period — só existe
      // depois de um clique no mapa, mas, a partir daí, segue o indicador
      // escolhido tal como o painel 1, sempre para a mesma célula.
      if (lastCell != null) {
        const cell = lastCell;
        // Sem valor antigo à vista enquanto carrega, ou se a consulta falhar.
        window.APP.hideCellCard();
        tasks.push(
          window.APP.renderChartForCell(sel.indicator, cell.id).then((series) => {
            if (series && lastCell === cell && !window.APP.cellCardDismissed) showCellCard(cell, series, sel);
          })
        );
      }
      await Promise.all(tasks);
    }

    // Clique no mapa: preenche o painel 2 (#chart-panel-cell) com a série do
    // ponto para o indicador atual, sem tocar nos seletores nem no painel 1.
    window.APP.onCellClick(async (cell) => {
      lastCell = cell;
      window.APP.cellCardDismissed = false;
      window.APP.hideCellCard();
      document.getElementById("cell-location").textContent = formatCoordinates(cell);
      window.APP.syncUrl();
      const sel = window.APP.getSelection();
      const series = await window.APP.renderChartForCell(sel.indicator, cell.id);
      if (series && lastCell === cell) showCellCard(cell, series, sel);
    });

    function clearCell() {
      lastCell = null;
      window.APP.clearCellMarker();
      window.APP.clearCellChart();
    }

    document.getElementById("btn-cell-clear").addEventListener("click", () => {
      clearCell();
      window.APP.syncUrl();
    });

    if (urlState.cellId) {
      const restoreCell = () => {
        const { nuts2Code } = window.APP.getSelection();
        const cell = window.APP.cellsIndex.find((candidate) => candidate.id === urlState.cellId);
        if (nuts2Code && cell && cell.codigo !== nuts2Code) return;
        window.APP.selectCellById(urlState.cellId);
      };
      if (window.APP.cellsIndex) restoreCell();
      else window.APP.onCellsReady(restoreCell);
    }

    // nuts2_display.geojson carrega de forma assíncrona (ver f2_map.js::initMap) —
    // se o utilizador mudar de região antes desse fetch terminar,
    // focusRegion/setRegionClip saem em silêncio (guarda de nuts2Layer) e
    // nada os volta a chamar até à próxima mudança de seletor. Reaplica a
    // seleção atual assim que a camada estiver pronta (achado do
    // code-reviewer) — sem refazer pedidos de raster/gráfico, só o
    // destaque/recorte do mapa, e sem mexer numa vista válida vinda do endereço.
    window.APP.onNuts2Ready(() => {
      const sel = window.APP.getSelection();
      const selectedRegionCode = sel.regionMode === "regiao" ? sel.nuts2Code : null;
      window.APP.focusRegion(selectedRegionCode, urlState.view != null || selectedRegionCode == null);
      window.APP.setRegionClip(selectedRegionCode);
      window.APP.updateCompare();
    });

    // O aviso só sai numa mudança de seleção: limpá-lo no primeiro refresh
    // apagava os avisos de arranque (grelha de pontos ou limites por carregar).
    wirePlaceSearch();
    window.APP.initCompare(urlState.compare);

    window.APP.onSelectionChange(() => {
      window.APP.hideError();
      return refresh();
    });
    window.APP.map.on("moveend", window.APP.syncUrl);
    await refresh();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
