// ============================================================================
// F2_MAP.JS — mapa base, escolha de basemap, contorno NUTS II.
// ============================================================================

(function () {
  let currentBasemapKey = "dark";
  let basemapLayer = null;
  let focusedRegionCode = null;

  // O contorno segue o mapa de fundo: branco desaparecia no basemap claro. Com
  // uma região selecionada, só o dela se vê (ver NUTS2_HIGHLIGHT_STYLE).
  const nuts2DefaultStyle = () => ({
    color: window.APP.BASEMAPS[currentBasemapKey].outline,
    weight: 1.5,
    fillOpacity: 0,
    opacity: focusedRegionCode == null ? 0.6 : 0,
  });
  // Mesmo tom de --accent em CSS/style.css, para a região selecionada se
  // destacar claramente do resto do contorno NUTS II.
  const NUTS2_HIGHLIGHT_STYLE = { color: "#3fa7c9", weight: 4, fillOpacity: 0, opacity: 1 };

  // Pontos da grelha ClimateEU (blocos de 5 km, 3574 células) — dados, não
  // camadas: um clique no mapa escolhe o mais próximo. Os antigos círculos
  // invisíveis de raio fixo (9 px) não escalavam com o zoom: a zoom 7
  // sobrepunham-se (abria um ponto vizinho) e a zoom 12 só 1% do mapa era
  // clicável, com cliques a falhar em silêncio. 4 km cobre a meia diagonal de
  // um bloco de 5 km (3,54 km); mais longe disso, o clique está fora da grelha.
  const MAX_CELL_PICK_KM = 4;
  // Com uma região selecionada, o clique já está dentro dela, e o ponto da
  // região mais próximo pode ficar a mais de um bloco: junto ao limite, o bloco
  // vizinho pertence à região do lado.
  const MAX_REGION_CELL_PICK_KM = 10;
  const KM_PER_DEGREE = 111.32;
  // Só o ponto escolhido fica visível, para se saber o que foi consultado.
  const CELL_MARKER_STYLE = { radius: 7, color: "#ffffff", weight: 2, fillColor: "#3fa7c9", fillOpacity: 1, interactive: false };

  // Margem do enquadramento (px por lado). Em ecrãs estreitos, a vertical deixa
  // livres o resumo em cima e a atribuição em baixo; é igual nos 2 lados para o
  // enquadramento coincidir com o centro da câmara presa.
  const FIT_PADDING_PX = 24;
  const NARROW_FIT_PADDING_Y_PX = 64;
  // Folga à volta da extensão onde a câmara fica presa: a mesma fração da
  // região ou do país, para a linha de costa não ficar colada ao limite.
  const CAMERA_BOUNDS_PADDING = 0.05;
  const MIN_LABELS_ZOOM = 5.75;

  let cellClickCallbacks = [];
  let cellsReadyCallbacks = [];
  let cellMarker = null;
  let cellsLoadFailed = false;
  const CELLS_UNAVAILABLE_MESSAGE = "Não foi possível carregar os pontos do mapa. Recarrega a página para os poderes consultar.";
  let regionClip = null;
  let focusedRings = null;
  let cameraBounds = null;
  let needsFraming = false;
  let homeView = null;
  let placeLabels = [];
  let cellCard = null;
  let nuts2ReadyCallbacks = [];

  function buildBasemapLayer(key) {
    // Um grupo: o híbrido tem 2 camadas de tiles (satélite e nomes), e sair dele
    // tem de remover as duas.
    return L.layerGroup(
      window.APP.BASEMAPS[key].tiles.map(({ url, attribution, maxNativeZoom }) =>
        L.tileLayer(url, { attribution, maxZoom: 19, maxNativeZoom })
      )
    );
  }

  window.APP.buildBasemapLayer = buildBasemapLayer;

  window.APP.initMap = function initMap() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = L.map("map", {
      zoomControl: true,
      zoomAnimation: !reducedMotion,
      fadeAnimation: !reducedMotion,
      maxBoundsViscosity: 1, // a câmara presa não deixa arrastar para lá do limite
      bounceAtZoomLimits: false,
      zoomSnap: 0.25, // o enquadramento aproveita o ecrã em vez de saltar um nível inteiro
    });
    window.APP.map = map;
    map.createPane("labelsPane");
    applyCamera(L.latLngBounds(window.APP.PORTUGAL_BOUNDS), true);
    basemapLayer = buildBasemapLayer(currentBasemapKey);
    basemapLayer.addTo(map);
    map.on("zoomend", updateDragLock);
    map.on("resize", () => {
      // Com o mapa escondido (outro separador em telemóvel) o tamanho é 0: o zoom
      // calculado seria o máximo. Fica para quando voltar a ser visível.
      const { x, y } = map.getSize();
      if (!x || !y) return;
      const frame = needsFraming || map.getZoom() <= map.getMinZoom();
      applyCamera(cameraBounds, frame);
    });

    // Panes dedicados, de z-index fixo: a ordem das camadas não pode depender
    // de qual pedido assíncrono termina primeiro (renderRaster em f4_raster.js
    // faz 2 fetches e desenha só no fim; achado real com Playwright).
    map.createPane("rasterPane");
    map.getPane("rasterPane").style.zIndex = 410;
    map.createPane("nuts2Pane");
    map.getPane("nuts2Pane").style.zIndex = 420;
    map.createPane("cellsPane");
    map.getPane("cellsPane").style.zIndex = 440;
    map.getPane("labelsPane").style.zIndex = 450;
    map.getPane("labelsPane").style.pointerEvents = "none";
    window.APP.PANES = {
      raster: "rasterPane",
      nuts2: "nuts2Pane",
      cells: "cellsPane",
      labels: "labelsPane",
    };

    // data/nuts2_display.geojson — versão simplificada de data/nuts2.geojson
    // (319 026 → 6 342 vértices, mesmas 7 features/propriedades, mesmo CRS
    // EPSG:4326), gerada por spatial-data-engineer para corrigir um bug de
    // performance crítico: o ficheiro original, nunca simplificado, fazia o
    // zoom do mapa Leaflet bloquear o browser 60-80s (medido/isolado
    // experimentalmente). Usada tanto para o contorno visível como para a
    // geometria de focusRegion/setRegionClip abaixo.
    fetch("data/nuts2_display.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        window.APP.nuts2Layer = L.geoJSON(geojson, {
          style: nuts2DefaultStyle(),
          pane: window.APP.PANES.nuts2,
          interactive: false, // só desenha: o clique é tratado em map.on("click")
        }).addTo(map);
        // focusRegion/setRegionClip saem em silêncio (guarda de nuts2Layer)
        // se o utilizador mudar para "Esta região" antes deste fetch
        // terminar — achado do code-reviewer. Reaplica a seleção atual
        // assim que a camada estiver pronta, para não deixar a região
        // escolhida sem destaque/recorte até à próxima mudança de seletor.
        nuts2ReadyCallbacks.forEach((cb) => cb());
      })
      .catch((err) => {
        console.error("Falha a carregar nuts2_display.geojson:", err);
        window.APP.showError("Não foi possível carregar os limites das regiões. Recarrega a página para tentar outra vez.");
      });

    cellCard = new CellCard().addTo(map);
    addPlaceLabels(map);
    loadCells();
    map.on("click", (e) => pickCell(e.latlng));

    // Alternativa ao clique, por teclado: as setas do Leaflet movem o mapa e o
    // Enter consulta o ponto ao centro, assinalado só com uso de teclado
    // (#map.keyboard-focus em CSS): depois de um clique, :focus-visible também
    // ficava ativo e parecia um segundo ponto escolhido.
    const container = map.getContainer();
    container.setAttribute("aria-label", "Mapa. As setas movem, + e − fazem zoom, Enter consulta o ponto ao centro.");
    const showCentre = (e) => {
      if (e.target === container) container.classList.add("keyboard-focus");
    };
    const hideCentre = () => container.classList.remove("keyboard-focus");
    container.addEventListener("keyup", showCentre);
    container.addEventListener("keydown", (e) => {
      showCentre(e);
      if (e.key === "Enter" && e.target === container) pickCell(map.getCenter());
    });
    container.addEventListener("pointerdown", hideCentre);
    container.addEventListener("blur", hideCentre);

    return map;
  };

  function addPlaceLabels(map) {
    placeLabels = window.APP.PLACE_LABELS.map(([name, lat, lng]) =>
      L.tooltip({
        permanent: true,
        direction: "right",
        pane: window.APP.PANES.labels,
        className: "place-label",
        offset: [4, 0],
        interactive: false,
      })
        .setLatLng([lat, lng])
        .setContent(name)
        .addTo(map)
    );
  }

  function pointInRings(lat, lng, rings) {
    return rings.some((ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [latI, lngI] = ring[i];
        const [latJ, lngJ] = ring[j];
        if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
      }
      return inside;
    });
  }

  // rings === null: mostra todas as etiquetas (vista nacional).
  function showPlaceLabelsWithin(rings) {
    placeLabels.forEach((label) => {
      const { lat, lng } = label.getLatLng();
      label.setOpacity(!rings || pointInRings(lat, lng, rings) ? 1 : 0);
    });
  }

  function fitPadding() {
    // Com o telemóvel deitado o resumo fica a um canto (CSS) e não há altura a
    // perder: a margem maior deixaria o país minúsculo.
    const summaryOnTop = window.matchMedia("(max-width: 1000px) and (min-height: 501px)").matches;
    return [FIT_PADDING_PX, summaryOnTop ? NARROW_FIT_PADDING_Y_PX : FIT_PADDING_PX];
  }

  // Limpa o zoom mínimo antes: getBoundsZoom limita o resultado a ele, e encolher
  // a janela nunca o deixaria descer.
  function fitZoomFor(bounds) {
    const map = window.APP.map;
    const [paddingX, paddingY] = fitPadding();
    map.setMinZoom(0);
    return map.getBoundsZoom(bounds, false, L.point(paddingX * 2, paddingY * 2));
  }

  // No enquadramento mínimo a extensão já se vê toda: não há para onde arrastar.
  function updateDragLock() {
    const map = window.APP.map;
    if (map.getZoom() <= map.getMinZoom()) map.dragging.disable();
    else map.dragging.enable();
    // Num mapa muito pequeno, as 18 etiquetas sobrepõem-se e não se leem.
    map.getPane("labelsPane").style.display = map.getZoom() < MIN_LABELS_ZOOM ? "none" : "";
  }

  // Prende a câmara à extensão indicada, e enquadra-a se frame for true: nem
  // arrastar para fora nem afastar mais do que o necessário para a ver inteira.
  // panInsideBounds sem animação antes de setMaxBounds: o pan animado que este
  // faria sozinho continuava depois de outras mudanças de vista, e uma vista
  // partilhada andava alguns píxeis a cada recarga.
  function applyCamera(bounds, frame) {
    const map = window.APP.map;
    cameraBounds = bounds;
    needsFraming = false;
    map.setMaxBounds(null);
    const fitZoom = fitZoomFor(bounds);
    if (frame || map.getZoom() < fitZoom) {
      map.fitBounds(bounds, { padding: fitPadding(), animate: false });
      if (focusedRegionCode == null) homeView = null;
    }
    map.setMinZoom(fitZoom);
    const limit = bounds.pad(CAMERA_BOUNDS_PADDING);
    map.panInsideBounds(limit, { animate: false });
    map.setMaxBounds(limit);
    updateDragLock();
    if (focusedRegionCode == null && !homeView) homeView = { center: map.getCenter(), zoom: map.getZoom() };
  }

  // Vista nacional por omissão: fica de fora do endereço (ver f7_main.js::syncUrl).
  // Tolerância: o Leaflet arredonda o centro aos píxeis.
  window.APP.isHomeView = function isHomeView() {
    const map = window.APP.map;
    if (focusedRegionCode != null || !homeView || map.getZoom() !== homeView.zoom) return false;
    const center = map.getCenter();
    return Math.abs(center.lat - homeView.center.lat) < 0.02 && Math.abs(center.lng - homeView.center.lng) < 0.02;
  };

  // Durante um zoom com a roda, uma vista nova seria desfeita no fim da animação,
  // e o zoom ainda por aplicar correria depois dela. Usa campos internos do
  // Leaflet (fixo na 1.9.4, ver index.html).
  function whenZoomSettled(callback) {
    const map = window.APP.map;
    const wheel = map.scrollWheelZoom;
    clearTimeout(wheel._timer);
    wheel._delta = 0;
    wheel._startTime = null;
    if (map._animatingZoom) map.once("zoomend", callback);
    else callback();
  }

  // Grelha ClimateEU — mesmo padrão de 2 pedidos (meta depois GeoJSON) já
  // usado em renderRaster (f4_raster.js) e renderChart (f5_charts.js).
  async function loadCells() {
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}/cells-grid`);
      if (!metaRes.ok) throw new Error(`Sem grelha de células (HTTP ${metaRes.status})`);
      const meta = await metaRes.json();

      const geojsonRes = await fetch(meta.url);
      const geojson = await geojsonRes.json();

      window.APP.cellsIndex = geojson.features.map((feature) => ({
        id: feature.properties.id,
        codigo: feature.properties.codigo,
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
      }));
      cellsReadyCallbacks.forEach((cb) => cb());
    } catch (err) {
      console.error("Falha a carregar cells-grid:", err);
      cellsLoadFailed = true;
      window.APP.showError(CELLS_UNAVAILABLE_MESSAGE);
    }
  }

  function pickCell(latlng) {
    if (cellsLoadFailed) {
      window.APP.showError(CELLS_UNAVAILABLE_MESSAGE);
      return;
    }
    // Fora da região selecionada nada está desenhado: não há o que consultar.
    if (focusedRings && !pointInRings(latlng.lat, latlng.lng, focusedRings)) return;
    const cell = nearestCell(latlng);
    if (cell) selectCell(cell);
  }

  function nearestCell(latlng) {
    if (!window.APP.cellsIndex) return null;
    const lngScale = Math.cos((latlng.lat * Math.PI) / 180);
    let nearest = null;
    const maxKm = focusedRegionCode != null ? MAX_REGION_CELL_PICK_KM : MAX_CELL_PICK_KM;
    let nearestSquared = (maxKm / KM_PER_DEGREE) ** 2;
    window.APP.cellsIndex.forEach((cell) => {
      // Com uma região selecionada, o resto do país não está desenhado: só
      // contam os pontos dessa região. Filtrar aqui, e não depois: junto ao
      // limite, o ponto mais próximo de um clique na região pode ser da vizinha.
      if (focusedRegionCode != null && cell.codigo !== focusedRegionCode) return;
      const dLat = cell.lat - latlng.lat;
      const dLng = (cell.lng - latlng.lng) * lngScale;
      const squared = dLat * dLat + dLng * dLng;
      if (squared <= nearestSquared) {
        nearest = cell;
        nearestSquared = squared;
      }
    });
    return nearest;
  }

  // Ponto da grelha mais próximo de um lugar, sem o filtro da região selecionada:
  // a pesquisa de concelhos pode levar a outra região.
  window.APP.nearestCellAnywhere = function nearestCellAnywhere(lat, lng) {
    const lngScale = Math.cos((lat * Math.PI) / 180);
    let nearest = null;
    let nearestSquared = Infinity;
    (window.APP.cellsIndex || []).forEach((cell) => {
      const squared = (cell.lat - lat) ** 2 + ((cell.lng - lng) * lngScale) ** 2;
      if (squared < nearestSquared) {
        nearest = cell;
        nearestSquared = squared;
      }
    });
    return nearest;
  };

  function selectCell(cell) {
    if (cellMarker) {
      cellMarker.setLatLng([cell.lat, cell.lng]);
    } else {
      cellMarker = L.circleMarker([cell.lat, cell.lng], { ...CELL_MARKER_STYLE, pane: window.APP.PANES.cells }).addTo(window.APP.map);
    }
    cellClickCallbacks.forEach((cb) => cb(cell));
  }

  window.APP.selectCellById = function selectCellById(cellId) {
    const cell = (window.APP.cellsIndex || []).find((candidate) => candidate.id === cellId);
    if (cell) selectCell(cell);
  };

  window.APP.clearCellMarker = function clearCellMarker() {
    if (cellMarker) window.APP.map.removeLayer(cellMarker);
    cellMarker = null;
    window.APP.hideCellCard();
  };

  // Cartão num canto do mapa, em vez de um popup no ponto: com a câmara presa, o
  // mapa não pode deslocar-se para dar espaço a um popup junto ao limite, que
  // ficava fora do ecrã. O cartão também não mexe na vista.
  const CellCard = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      const element = L.DomUtil.create("div", "cell-card");
      element.hidden = true;
      element.setAttribute("role", "status");
      L.DomEvent.disableClickPropagation(element);
      L.DomEvent.disableScrollPropagation(element);
      return element;
    },
  });

  window.APP.showCellCard = function showCellCard(html) {
    const element = cellCard.getContainer();
    element.innerHTML = html;
    element.hidden = false;
  };

  window.APP.hideCellCard = function hideCellCard() {
    cellCard.getContainer().hidden = true;
  };

  // Regista um callback chamado com a célula escolhida (`{id, codigo, lat,
  // lng}`) — mesmo padrão de window.APP.onSelectionChange em f3_controls.js.
  window.APP.onCellClick = function onCellClick(callback) {
    cellClickCallbacks.push(callback);
  };

  window.APP.onCellsReady = function onCellsReady(callback) {
    cellsReadyCallbacks.push(callback);
  };

  // Regista um callback chamado quando window.APP.nuts2Layer fica pronto
  // (fetch de data/nuts2_display.geojson resolvido) — ver nota acima sobre a
  // condição de corrida com focusRegion/setRegionClip.
  window.APP.onNuts2Ready = function onNuts2Ready(callback) {
    nuts2ReadyCallbacks.push(callback);
  };

  window.APP.getBasemap = () => currentBasemapKey;

  window.APP.setBasemap = function setBasemap(key) {
    currentBasemapKey = key;
    window.APP.map.removeLayer(basemapLayer);
    basemapLayer = buildBasemapLayer(key);
    basemapLayer.addTo(window.APP.map);
    document.documentElement.style.setProperty("--basemap-land", window.APP.BASEMAPS[key].land);
    if (window.APP.nuts2Layer) {
      window.APP.nuts2Layer.eachLayer((layer) => {
        if (layer.feature.properties.codigo !== focusedRegionCode) layer.setStyle(nuts2DefaultStyle());
      });
    }
    if (window.APP.onBasemapChanged) window.APP.onBasemapChanged();
  };

  // Reflete a seleção de região no mapa: destaca o contorno da região NUTS II
  // escolhida, enquadra-a e prende a câmara à sua extensão. code === null (modo
  // "nacional") repõe o contorno normal e a vista de Portugal Continental, com a
  // câmara presa ao país.
  //
  // animate: false (achado real, Playwright + inspeção do DOM SVG): com
  // fitBounds()/setView() animados, 2 mudanças de região próximas no tempo
  // deixam a 2ª a interromper a animação da 1ª. Uma camada criada nesse
  // intervalo (setRegionClip cria sempre uma nova) fica projetada com um estado
  // transitório de zoom do Leaflet, e nada a volta a corrigir: a geometria
  // desaparecia do <path> SVG. Sem animação não há esse estado transitório.
  //
  // keepView: mantém a vista atual (restaurada de uma ligação partilhada, ver
  // f7_main.js), mas só se estiver dentro da extensão: uma ligação com a vista
  // do país e uma região selecionada tem de enquadrar a região na mesma.
  window.APP.focusRegion = function focusRegion(code, keepView = false) {
    if (!window.APP.nuts2Layer || !window.APP.map) return;
    const map = window.APP.map;
    focusedRegionCode = code;
    let matched = null;
    window.APP.nuts2Layer.eachLayer((layer) => {
      const isMatch = code != null && layer.feature.properties.codigo === code;
      layer.setStyle(isMatch ? NUTS2_HIGHLIGHT_STYLE : nuts2DefaultStyle());
      if (isMatch) matched = layer;
    });

    const bounds = matched ? matched.getBounds() : L.latLngBounds(window.APP.PORTUGAL_BOUNDS);
    const { x, y } = map.getSize();
    if (!x || !y) {
      cameraBounds = bounds;
      needsFraming = true;
      return;
    }
    whenZoomSettled(() => {
      const viewFits = bounds.contains(map.getCenter()) && map.getZoom() >= fitZoomFor(bounds);
      applyCamera(bounds, !keepView || !viewFits);
    });
  };

  // Área plana (shoelace) de um anel em coordenadas [lng,lat] — só serve
  // para comparar áreas relativas entre anéis da mesma feature (não
  // geodésica, mas suficiente à escala de Portugal Continental).
  function ringArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [lng1, lat1] = ring[i];
      const [lng2, lat2] = ring[(i + 1) % ring.length];
      sum += lng1 * lat2 - lng2 * lat1;
    }
    return Math.abs(sum) / 2;
  }

  // Anéis cuja área é inferior a esta fração da área do maior anel da
  // mesma feature são tratados como resíduos de digitalização e
  // descartados por regionOuterRings — ver nota abaixo.
  const RESIDUAL_RING_AREA_RATIO = 0.01;

  // Extrai só os anéis exteriores "reais" dos polígonos de uma feature NUTS II
  // (Polygon ou MultiPolygon), já convertidos de [lng,lat] (GeoJSON) para
  // [lat,lng] (Leaflet). Anéis interiores são ignorados de propósito.
  //
  // Filtro de resíduos (achado real, confirmado por inspeção de
  // data/nuts2.geojson): cada região é um MultiPolygon com dezenas de polígonos
  // residuais de dissolução de município (<0.03% da área do principal) além do
  // único polígono "real" — ex. Grande Lisboa tem 32 na geometria simplificada,
  // 31 deles resíduos junto à foz do Tejo. Todas as 7 regiões têm exatamente 1
  // polígono acima de 1% da área do maior; o critério, relativo ao maior anel da
  // própria feature, continua válido para uma região com várias partes reais.
  function regionOuterRings(feature) {
    const geom = feature.geometry;
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    const outerRingsLngLat = polygons.map((rings) => rings[0]);
    const areas = outerRingsLngLat.map(ringArea);
    const maxArea = Math.max(...areas);
    return outerRingsLngLat
      .filter((_, i) => areas[i] >= RESIDUAL_RING_AREA_RATIO * maxArea)
      .map((ring) => ring.map(([lng, lat]) => [lat, lng]));
  }

  // Recorta as isobandas à região: só a área escolhida fica desenhada e o resto
  // do mapa de fundo fica como na vista nacional. Sem dados novos (reaproveita
  // window.APP.nuts2Layer) e sem alterar o raster, que continua nacional.
  //
  // Um <clipPath> no SVG do rasterPane, cuja geometria é o <path> de um L.polygon
  // desse mesmo renderer: o Leaflet continua a atualizá-lo em cada zoom/pan, e o
  // recorte acompanha-o. Usa campos internos do L.SVG (_container, _rootGroup) e
  // do L.Path (_path): Leaflet está fixo na 1.9.4, ver index.html; há testes e2e a
  // confirmar o recorte no DOM e no que o browser desenha.
  window.APP.createRegionClip = function createRegionClip(map, rings, clipId, pane) {
    const shape = L.polygon(rings.map((ring) => [ring]), { stroke: false, fill: false, interactive: false, pane }).addTo(map);
    const renderer = shape._renderer;
    const element = L.SVG.create("clipPath");
    element.setAttribute("id", clipId);
    element.appendChild(shape._path);
    renderer._container.appendChild(element);
    renderer._rootGroup.setAttribute("clip-path", `url(#${clipId})`);
    return {
      shape,
      remove() {
        renderer._rootGroup.removeAttribute("clip-path");
        map.removeLayer(shape);
        element.remove();
      },
    };
  };

  window.APP.getFocusedRings = () => focusedRings;

  window.APP.setRegionClip = function setRegionClip(code) {
    if (regionClip) {
      regionClip.remove();
      regionClip = null;
      window.APP.regionClipShape = null;
    }
    if (!window.APP.nuts2Layer || !window.APP.map) return;

    let matchedFeature = null;
    if (code != null) {
      window.APP.nuts2Layer.eachLayer((layer) => {
        if (layer.feature.properties.codigo === code) matchedFeature = layer.feature;
      });
    }
    focusedRings = null;
    if (!matchedFeature) {
      showPlaceLabelsWithin(null);
      return;
    }

    const rings = regionOuterRings(matchedFeature);
    focusedRings = rings;
    showPlaceLabelsWithin(rings);
    regionClip = window.APP.createRegionClip(window.APP.map, rings, "region-clip", window.APP.PANES.raster);
    window.APP.regionClipShape = regionClip.shape; // exposto para inspeção/testes, mesmo padrão de nuts2Layer
  };
})();
