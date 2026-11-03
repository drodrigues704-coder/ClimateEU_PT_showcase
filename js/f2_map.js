// ============================================================================
// F2_MAP.JS — mapa base, alternância de basemap, contorno NUTS II.
// ============================================================================

(function () {
  let currentBasemapKey = "dark";
  let basemapLayer = null;
  let focusedRegionCode = null;

  // O contorno segue o mapa de fundo: branco desaparecia no basemap claro.
  const NUTS2_OUTLINE_COLORS = { dark: "#ffffff", light: "#1b2a36" };
  const nuts2DefaultStyle = () => ({
    color: NUTS2_OUTLINE_COLORS[currentBasemapKey],
    weight: 1.5,
    fillOpacity: 0,
    opacity: 0.6,
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
  const KM_PER_DEGREE = 111.32;
  // Só o ponto escolhido fica visível, para se saber o que foi consultado.
  const CELL_MARKER_STYLE = { radius: 7, color: "#ffffff", weight: 2, fillColor: "#3fa7c9", fillOpacity: 1, interactive: false };

  // Cor/opacidade da máscara de região (ver setRegionMask abaixo) — usa
  // --panel-bg do CSS (não --bg) por ser o tom já usado para "superfície
  // de painel" nesta paleta, com opacidade alta (0.85) para escurecer sem
  // ficar 100% opaca (dá para perceber que há mais país por baixo).
  const REGION_MASK_COLOR = "#12222f";
  const REGION_MASK_OPACITY = 0.85;
  // Anel exterior da máscara: cobre toda a extensão que o Leaflet alguma
  // vez mostra (latitude ±90, longitude bem além de ±180 para aguentar
  // pan/zoom-out sem deixar bordas visíveis).
  const WORLD_RING = [[-90, -200], [-90, 200], [90, 200], [90, -200]];

  let cellClickCallbacks = [];
  let cellsReadyCallbacks = [];
  let cellMarker = null;
  let cellsLoadFailed = false;
  const CELLS_UNAVAILABLE_MESSAGE = "Não foi possível carregar os pontos do mapa. Recarrega a página para os poderes consultar.";
  let regionMaskLayer = null;
  let nuts2ReadyCallbacks = [];

  function buildBasemapLayer(key) {
    const cfg = window.APP.BASEMAPS[key];
    // Esri Canvas (ArcGIS REST) não usa {s} — sem subdomains. Zoom nativo
    // vai até 16; maxZoom 19 deixa o Leaflet reescalar acima disso.
    return L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 19, maxNativeZoom: 16 });
  }

  window.APP.initMap = function initMap() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = L.map("map", { zoomControl: true, zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion })
      .setView(window.APP.PORTUGAL_CENTER, window.APP.PORTUGAL_ZOOM);
    basemapLayer = buildBasemapLayer(currentBasemapKey);
    basemapLayer.addTo(map);
    window.APP.map = map;

    // Panes dedicados para o raster, o contorno NUTS II, a máscara de
    // região e a grelha de células — substitui a escolha original de
    // deixar tudo no overlayPane por omissão e reordenar com
    // bringToFront() a cada render. Achado real (browser + Playwright,
    // não visível em node --check nem em testes que só confirmam "a
    // camada existe"): renderRaster (f4_raster.js) é assíncrono (2
    // fetches) e chama currentLayer.bringToFront() só depois de resolver;
    // refresh() (f7_main.js) chama setRegionMask() de forma síncrona
    // *antes* de despoletar renderRaster() — quando o fetch do raster
    // terminava (sempre, mesmo com resposta em cache), o seu
    // bringToFront() corria depois do da máscara e voltava a enterrá-la,
    // sem haver mais nenhum evento a repor a ordem. Resultado visível: a
    // máscara existe no DOM (passava em testes que só verificavam isso)
    // mas o raster ficava sempre por cima, tapando-a por completo. Com
    // panes de z-index fixo a ordem deixa de depender de qual pedido
    // assíncrono termina primeiro — bringToFront() dentro de cada pane
    // deixa de ser necessário (só há 1 "tipo" de camada por pane) e foi
    // removido dos outros ficheiros.
    map.createPane("rasterPane");
    map.getPane("rasterPane").style.zIndex = 410;
    map.createPane("nuts2Pane");
    map.getPane("nuts2Pane").style.zIndex = 420;
    map.createPane("regionMaskPane");
    map.getPane("regionMaskPane").style.zIndex = 430;
    map.createPane("cellsPane");
    map.getPane("cellsPane").style.zIndex = 440;
    map.createPane("labelsPane");
    map.getPane("labelsPane").style.zIndex = 450;
    map.getPane("labelsPane").style.pointerEvents = "none";
    window.APP.PANES = {
      raster: "rasterPane",
      nuts2: "nuts2Pane",
      regionMask: "regionMaskPane",
      cells: "cellsPane",
      labels: "labelsPane",
    };

    // data/nuts2_display.geojson — versão simplificada de data/nuts2.geojson
    // (319 026 → 6 342 vértices, mesmas 7 features/propriedades, mesmo CRS
    // EPSG:4326), gerada por spatial-data-engineer para corrigir um bug de
    // performance crítico: o ficheiro original, nunca simplificado, fazia o
    // zoom do mapa Leaflet bloquear o browser 60-80s (medido/isolado
    // experimentalmente). Usada tanto para o contorno visível como para a
    // geometria de focusRegion/setRegionMask abaixo — ver notas aí sobre a
    // validação visual feita com esta geometria simplificada.
    fetch("data/nuts2_display.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        window.APP.nuts2Layer = L.geoJSON(geojson, {
          style: nuts2DefaultStyle(),
          pane: window.APP.PANES.nuts2,
        }).addTo(map);
        // focusRegion/setRegionMask saem em silêncio (guarda de nuts2Layer)
        // se o utilizador mudar para "Esta região" antes deste fetch
        // terminar — achado do code-reviewer. Reaplica a seleção atual
        // assim que a camada estiver pronta, para não deixar a região
        // escolhida sem destaque/máscara até à próxima mudança de seletor.
        nuts2ReadyCallbacks.forEach((cb) => cb());
      })
      .catch((err) => {
        console.error("Falha a carregar nuts2_display.geojson:", err);
        window.APP.showError("Não foi possível carregar os limites das regiões. Recarrega a página para tentar outra vez.");
      });

    addPlaceLabels(map);
    loadCells();
    map.on("click", (e) => {
      if (cellsLoadFailed) {
        window.APP.showError(CELLS_UNAVAILABLE_MESSAGE);
        return;
      }
      const cell = nearestCell(e.latlng);
      if (cell) selectCell(cell);
    });

    return map;
  };

  function addPlaceLabels(map) {
    window.APP.PLACE_LABELS.forEach(([name, lat, lng]) => {
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
        .addTo(map);
    });
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

  function nearestCell(latlng) {
    if (!window.APP.cellsIndex) return null;
    const lngScale = Math.cos((latlng.lat * Math.PI) / 180);
    let nearest = null;
    let nearestSquared = (MAX_CELL_PICK_KM / KM_PER_DEGREE) ** 2;
    window.APP.cellsIndex.forEach((cell) => {
      // Com uma região selecionada, o resto do país está tapado pela máscara:
      // só contam os pontos dessa região. Filtrar aqui, e não depois: junto ao
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
    window.APP.map.closePopup();
  };

  window.APP.openCellPopup = function openCellPopup(cell, html) {
    // Em ecrãs estreitos, o resumo e o zoom ficam por cima do mapa: o autoPan tem
    // de deixar o popup abaixo deles, senão tapam o título e o botão de fechar.
    const narrow = window.matchMedia("(max-width: 1000px)").matches;
    L.popup({ offset: [0, -6], autoPanPaddingTopLeft: narrow ? [8, 108] : [5, 5] })
      .setLatLng([cell.lat, cell.lng])
      .setContent(html)
      .openOn(window.APP.map);
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
  // condição de corrida com focusRegion/setRegionMask.
  window.APP.onNuts2Ready = function onNuts2Ready(callback) {
    nuts2ReadyCallbacks.push(callback);
  };

  window.APP.getBasemap = () => currentBasemapKey;

  window.APP.toggleBasemap = function toggleBasemap() {
    currentBasemapKey = currentBasemapKey === "dark" ? "light" : "dark";
    window.APP.map.removeLayer(basemapLayer);
    basemapLayer = buildBasemapLayer(currentBasemapKey);
    basemapLayer.addTo(window.APP.map);
    basemapLayer.bringToBack();
    document.documentElement.style.setProperty("--basemap-land", window.APP.BASEMAPS[currentBasemapKey].land);
    if (window.APP.nuts2Layer) {
      window.APP.nuts2Layer.eachLayer((layer) => {
        if (layer.feature.properties.codigo !== focusedRegionCode) layer.setStyle(nuts2DefaultStyle());
      });
    }
    return currentBasemapKey;
  };

  // Reflete a seleção de região no mapa: destaca o contorno da região
  // NUTS II escolhida e dá zoom/fit à sua extensão. code === null (modo
  // "nacional") repõe o contorno normal e a vista de Portugal Continental.
  // O raster (isobandas) continua sempre nacional — não há recorte por
  // região no catálogo, só a série temporal é que é por região.
  //
  // animate: false (achado real, Playwright + inspeção do DOM SVG, não
  // visível em node --check nem em testes que só confirmam "a camada
  // existe"): refresh() (f7_main.js) chama focusRegion() e depois
  // setRegionMask() a cada mudança de seletor — setRegionMask() remove a
  // regionMaskLayer anterior e cria sempre uma nova instância L.polygon
  // (nunca reaproveita). Com fitBounds()/setView() animados (comportamento
  // por omissão do Leaflet), 2 mudanças de região suficientemente
  // próximas no tempo (ex. escolher uma região a seguir a outra, ou voltar
  // a "Portugal Continental" e logo a seguir escolher uma região) deixam a
  // 2ª chamada de fitBounds() a interromper a animação de zoom/pan da 1ª
  // ainda a decorrer. A nova regionMaskLayer, criada e adicionada ao mapa
  // nesse intervalo, tem os seus pontos projetados (L.Path._project) com
  // base num estado de zoom/pixelOrigin transitório do Leaflet — e, como
  // não há mais nenhum evento 'zoomend'/'viewreset' a seguir (a animação
  // interrompida não o dispara para esta camada nova), essa projeção
  // errada nunca mais se corrige (nem com espera, nem com zoom/pan manual
  // subsequente, que só repõe as camadas já estáveis). Resultado visível:
  // o anel do "buraco" da máscara (a geometria da região) desaparece por
  // completo do <path> SVG — só sobra o anel exterior (mundo), a máscara
  // cobre o país inteiro sem deixar ver a região selecionada. Confirmado
  // por varrimento de atraso entre as 2 chamadas (0–300 ms): falha sempre
  // com 0 ms, falha de forma intermitente entre ~20–80 ms (janela real da
  // animação de zoom do Leaflet, ~250 ms por omissão), nunca falha a partir
  // dos ~120 ms (animação já terminada). Sem animação, fitBounds()/
  // setView() aplicam a vista nova de forma síncrona — deixa de existir
  // essa janela de estado transitório, independentemente de quão depressa
  // o utilizador mudar de região.
  //
  // keepView: só atualiza o destaque, sem mexer na vista (vista restaurada de
  // uma ligação partilhada, ver f7_main.js).
  window.APP.focusRegion = function focusRegion(code, keepView = false) {
    if (!window.APP.nuts2Layer || !window.APP.map) return;
    focusedRegionCode = code;
    let matched = null;
    window.APP.nuts2Layer.eachLayer((layer) => {
      const isMatch = code != null && layer.feature.properties.codigo === code;
      layer.setStyle(isMatch ? NUTS2_HIGHLIGHT_STYLE : nuts2DefaultStyle());
      if (isMatch) matched = layer;
    });
    if (keepView) return;
    if (matched) {
      window.APP.map.fitBounds(matched.getBounds(), { padding: [24, 24], animate: false });
    } else {
      window.APP.map.setView(window.APP.PORTUGAL_CENTER, window.APP.PORTUGAL_ZOOM, { animate: false });
    }
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

  // Extrai só os anéis exteriores "reais" dos polígonos de uma feature
  // NUTS II (Polygon ou MultiPolygon), já convertidos de [lng,lat]
  // (GeoJSON) para [lat,lng] (Leaflet). Anéis interiores da própria
  // geometria (se algum NUTS II alguma vez tiver um buraco) são ignorados
  // de propósito — não faz sentido "furar o buraco" da máscara com um
  // buraco da região.
  //
  // Filtro de resíduos (achado real, confirmado por inspeção de
  // data/nuts2.geojson): cada uma das 7 regiões é um MultiPolygon com
  // dezenas de polígonos residuais de dissolução de município (bounding
  // box na casa das dezenas de metros, <0.03% da área do polígono
  // principal) além do único polígono "real" — ex. Grande Lisboa tem 39
  // polígonos, 38 deles resíduos junto à foz do Tejo, e só 1 (99.999% da
  // área, 19866 pontos) é a forma real da região. Sem filtro, os 38
  // resíduos entravam todos como "buracos" da máscara em setRegionMask, e
  // muitos anéis minúsculos sobrepostos/aninhados ali faziam a regra
  // evenodd do SVG alternar preenchido/vazado incorretamente naquela
  // zona — dava o efeito visto (mancha escura mal colocada na foz do
  // Tejo, resto do país sem máscara nenhuma). Todas as 7 regiões atuais
  // têm exatamente 1 polígono acima de 1% da área do maior; o critério
  // (relativo ao maior anel da própria feature, não um limiar absoluto de
  // graus) continua válido para uma região legitimamente multi-polígono
  // (ex. duas ilhas de área semelhante), caso que não existe nos dados
  // atuais mas que um limiar fixo de bounding-box não cobriria tão bem.
  //
  // Reverificado após a troca para data/nuts2_display.geojson (versão
  // simplificada usada em runtime desde a correção de performance do
  // zoom — ver initMap): a contagem de polígonos por região muda com a
  // simplificação (ex. Grande Lisboa passa de 39 para 32), mas o
  // resultado do filtro não — continua a sobrar exatamente 1 anel acima
  // de 1% da área do maior em cada uma das 7 regiões, pelo que o filtro
  // e a máscara continuam corretos com a geometria simplificada.
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

  // Máscara visual "buraco": um polígono cujo 1º anel é o mundo inteiro
  // (WORLD_RING) e os restantes são os anéis exteriores da região
  // selecionada — o Leaflet/SVG trata anéis depois do 1º como buracos, daí
  // tudo fora da região ficar coberto e a região em si ficar "vazada",
  // deixando ver o raster/basemap por baixo sem alteração. Não pede dados
  // novos: reaproveita a geometria já carregada em window.APP.nuts2Layer.
  // Fica ativa só em modo "regiao" com uma região escolhida — code === null
  // limpa a máscara (chamado a par de focusRegion em f7_main.js::refresh()).
  window.APP.setRegionMask = function setRegionMask(code) {
    if (regionMaskLayer) {
      window.APP.map.removeLayer(regionMaskLayer);
      regionMaskLayer = null;
      window.APP.regionMaskLayer = null;
    }
    if (code == null || !window.APP.nuts2Layer || !window.APP.map) return;

    let matchedFeature = null;
    window.APP.nuts2Layer.eachLayer((layer) => {
      if (layer.feature.properties.codigo === code) matchedFeature = layer.feature;
    });
    if (!matchedFeature) return;

    const rings = [WORLD_RING, ...regionOuterRings(matchedFeature)];
    regionMaskLayer = L.polygon(rings, {
      stroke: false,
      fillColor: REGION_MASK_COLOR,
      fillOpacity: REGION_MASK_OPACITY,
      interactive: false, // o clique chega ao mapa, que decide o que fazer (ver map.on("click"))
      pane: window.APP.PANES.regionMask,
    }).addTo(window.APP.map);

    // Acima do raster/contorno NUTS II (regionMaskPane > rasterPane/
    // nuts2Pane em z-index, ver initMap). Sem bringToFront(): era exatamente
    // essa dependência de ordem de inserção/chamada que fazia o
    // currentLayer.bringToFront() assíncrono de renderRaster (f4_raster.js)
    // enterrar a máscara sempre que corria depois deste ponto (achado real,
    // ver comentário em initMap).
    window.APP.regionMaskLayer = regionMaskLayer; // exposto para inspeção/testes, mesmo padrão de nuts2Layer
  };
})();
