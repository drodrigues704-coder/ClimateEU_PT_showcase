// ============================================================================
// F8_COMPARE.JS — 2.º mapa, ao lado do principal, com outro cenário/período.
// Segue a vista do mapa principal e usa as mesmas classes da legenda, que são
// fixas entre cenários: a mesma cor quer dizer o mesmo valor nos 2 mapas.
// ============================================================================

(function () {
  let compareMap = null;
  let basemapLayer = null;
  let rasterLayer = null;
  let regionClip = null;
  let clippedRings = null;
  let caption = null;
  let mainCaption = null;
  let latestRequest = 0;
  let placeLabels = [];
  let cellMarker = null;
  let chosenCell = null;

  const scenarioSelect = () => document.getElementById("ctl-compare-scenario");
  const periodSelect = () => document.getElementById("ctl-compare-period");
  const isActive = () => document.getElementById("ctl-compare").checked;

  const Caption = L.Control.extend({
    options: { position: "topleft" }, // à esquerda não há controlos neste mapa
    onAdd() {
      return L.DomUtil.create("div", "compare-caption");
    },
  });

  function refreshPeriodOptions() {
    const select = periodSelect();
    const allowed = window.APP.SCENARIO_PERIODS[scenarioSelect().value];
    const previous = select.value;
    select.innerHTML = "";
    allowed.forEach((period) => select.add(new Option(window.APP.PERIOD_LABELS[period], period)));
    if (allowed.includes(previous)) select.value = previous;
    select.disabled = allowed.length === 1;
  }

  function followMainMap() {
    if (compareMap._animatingZoom) return;
    const main = window.APP.map;
    if (compareMap.getZoom() === main.getZoom() && compareMap.getCenter().equals(main.getCenter(), 1e-7)) return;
    compareMap.setView(main.getCenter(), main.getZoom(), { animate: false });
  }

  function createMap() {
    // Só mostra: mover e aproximar faz-se no mapa principal.
    compareMap = L.map("map-compare", {
      zoomControl: false,
      attributionControl: false, // os créditos do mapa principal cobrem os 2
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0,
      fadeAnimation: false,
    });
    compareMap.createPane("compareRasterPane").style.zIndex = 410;
    compareMap.createPane("compareMarkerPane").style.zIndex = 440;
    const labelsPane = compareMap.createPane("compareLabelsPane");
    labelsPane.style.zIndex = 450;
    labelsPane.style.pointerEvents = "none";
    placeLabels = window.APP.PLACE_LABELS.map(([name, lat, lng]) =>
      L.tooltip({ permanent: true, direction: "right", pane: "compareLabelsPane", className: "place-label", offset: [4, 0], interactive: false })
        .setLatLng([lat, lng])
        .setContent(name)
        .addTo(compareMap)
    );
    compareMap.on("zoomend", () => {
      labelsPane.style.display = compareMap.getZoom() < window.APP.MIN_LABELS_ZOOM ? "none" : "";
    });
    caption = new Caption().addTo(compareMap);
    // Com 2 mapas, cada um diz o que mostra. No principal, à direita: à esquerda está o zoom.
    mainCaption = new Caption({ position: "topright" }).addTo(window.APP.map);
    followMainMap();
    // Cada passo de pinça obrigaria a reprojetar as isobandas deste mapa: segue só
    // no fim do gesto, e sem comparação não segue.
    window.APP.map.on("move zoom zoomend", (e) => {
      if (!e.pinch && isActive()) followMainMap();
    });
    // O zoom da roda e dos botões anima em simultâneo nos 2 mapas.
    window.APP.map.on("zoomanim", (e) => {
      if (isActive()) compareMap.setView(e.center, e.zoom, { animate: true });
    });
    compareMap.on("zoomend", () => {
      if (isActive()) followMainMap();
    });
    window.APP.map.on("resize", window.APP.invalidateCompare);
    showChosenCell();
  }

  // O mesmo ponto nos 2 mapas, para comparar o mesmo sítio.
  function showChosenCell() {
    if (!compareMap) return;
    if (cellMarker) compareMap.removeLayer(cellMarker);
    cellMarker = chosenCell
      ? L.circleMarker([chosenCell.lat, chosenCell.lng], { ...window.APP.CELL_MARKER_STYLE, pane: "compareMarkerPane" }).addTo(compareMap)
      : null;
  }

  window.APP.invalidateCompare = function invalidateCompare() {
    if (!compareMap) return;
    compareMap.invalidateSize({ animate: false });
    followMainMap();
  };

  function showBasemap() {
    if (basemapLayer) compareMap.removeLayer(basemapLayer);
    basemapLayer = window.APP.buildBasemapLayer(window.APP.getBasemap());
    basemapLayer.addTo(compareMap);
  }

  function syncRegionClip() {
    const rings = window.APP.getFocusedRings();
    if (rings === clippedRings) return;
    if (regionClip) regionClip.remove();
    regionClip = rings ? window.APP.createRegionClip(compareMap, rings, "region-clip-compare", "compareRasterPane") : null;
    clippedRings = rings;
    placeLabels.forEach((label) => {
      const { lat, lng } = label.getLatLng();
      label.setOpacity(!rings || window.APP.pointInRings(lat, lng, rings) ? 1 : 0);
    });
  }

  async function renderRaster() {
    const { indicator } = window.APP.getSelection();
    const scenario = scenarioSelect().value;
    const period = periodSelect().value;
    const request = ++latestRequest;
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}/raster/${indicator}/${scenario}/${period}`);
      if (!metaRes.ok) throw new Error(`compare raster: HTTP ${metaRes.status}`);
      const meta = await metaRes.json();
      const geojson = await (await fetch(meta.url)).json();
      if (request !== latestRequest || !isActive()) return;
      if (rasterLayer) compareMap.removeLayer(rasterLayer);
      rasterLayer = L.geoJSON(geojson, {
        filter: window.APP.isPolygonFeature,
        pane: "compareRasterPane",
        interactive: false,
        style: window.APP.rasterStyle,
      }).addTo(compareMap);
      // Só agora: se o pedido falhar, a legenda continua a dizer o que o mapa mostra.
      caption.getContainer().textContent = `${window.APP.SCENARIO_LABELS[scenario]}, ${window.APP.PERIOD_LABELS[period]}`;
    } catch (err) {
      console.error(err);
      if (request === latestRequest) window.APP.showError("Não foi possível carregar o mapa de comparação. Recarrega a página para tentar outra vez.");
    }
  }

  // Chamada por f7_main.js::refresh a cada mudança de seleção.
  window.APP.updateCompare = function updateCompare() {
    if (!isActive() || !compareMap) return;
    const { scenario, period } = window.APP.getSelection();
    mainCaption.getContainer().textContent = `${window.APP.SCENARIO_LABELS[scenario]}, ${window.APP.PERIOD_LABELS[period]}`;
    syncRegionClip();
    renderRaster();
  };

  window.APP.onBasemapChanged = function onBasemapChanged() {
    if (isActive() && compareMap) showBasemap();
  };

  function setActive(active) {
    document.body.classList.toggle("comparing", active);
    document.getElementById("ctl-compare-wrapper").hidden = !active;
    window.APP.map.invalidateSize({ animate: false });
    if (active) {
      if (!compareMap) createMap();
      window.APP.invalidateCompare();
      showBasemap();
      window.APP.updateCompare();
    }
    window.APP.syncUrl();
  }

  // Valor do parâmetro `cmp` no endereço, ou null sem comparação.
  window.APP.getCompareParam = () => (isActive() ? `${scenarioSelect().value}:${periodSelect().value}` : null);

  window.APP.initCompare = function initCompare(param) {
    window.APP.onCellClick((cell) => {
      chosenCell = cell;
      showChosenCell();
    });
    window.APP.onCellCleared = () => {
      chosenCell = null;
      showChosenCell();
    };

    const select = scenarioSelect();
    Object.entries(window.APP.SCENARIO_LABELS).forEach(([key, label]) => select.add(new Option(label, key)));
    select.value = "ssp585";
    refreshPeriodOptions();
    periodSelect().value = "fim";

    select.addEventListener("change", () => {
      refreshPeriodOptions();
      window.APP.updateCompare();
      window.APP.syncUrl();
    });
    periodSelect().addEventListener("change", () => {
      window.APP.updateCompare();
      window.APP.syncUrl();
    });
    document.getElementById("ctl-compare").addEventListener("change", (e) => setActive(e.target.checked));

    const [scenario, period] = (param || "").split(":");
    if (!Object.hasOwn(window.APP.SCENARIO_PERIODS, scenario) || !window.APP.SCENARIO_PERIODS[scenario].includes(period)) return;
    select.value = scenario;
    refreshPeriodOptions();
    periodSelect().value = period;
    document.getElementById("ctl-compare").checked = true;
    setActive(true);
  };
})();
