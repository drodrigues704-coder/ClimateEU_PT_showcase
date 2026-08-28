// ============================================================================
// F2_MAP.JS — mapa base, alternância de basemap, contorno NUTS II.
// ============================================================================

(function () {
  let currentBasemapKey = "dark";
  let basemapLayer = null;

  const NUTS2_DEFAULT_STYLE = { color: "#ffffff", weight: 1.5, fillOpacity: 0, opacity: 0.6 };
  // Mesmo tom de --accent em CSS/style.css, para a região selecionada se
  // destacar claramente do resto do contorno NUTS II.
  const NUTS2_HIGHLIGHT_STYLE = { color: "#3fa7c9", weight: 4, fillOpacity: 0, opacity: 1 };

  // Pontos da grelha ClimateEU (blocos de 5 km, 3574 células) — sempre
  // invisíveis, mesmo no hover (decisão de design: nenhuma pista visual de
  // onde estão os pontos, só a área de clique). Radius um pouco maior do
  // que o "visual" faria sentido (5 → 9) só para alargar a área de deteção
  // de clique, já que não há nenhum contorno a ajudar a acertar. pane:
  // preenchido em loadCellsLayer (só existe depois de window.APP.PANES
  // ser definido em initMap).
  const CELL_DEFAULT_STYLE = { radius: 9, color: "#3fa7c9", weight: 1, fillColor: "#3fa7c9", fillOpacity: 0, opacity: 0 };

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
  let regionMaskLayer = null;
  let nuts2ReadyCallbacks = [];

  function buildBasemapLayer(key) {
    const cfg = window.APP.BASEMAPS[key];
    // Esri Canvas (ArcGIS REST) não usa {s} — sem subdomains. Zoom nativo
    // vai até 16; maxZoom 19 deixa o Leaflet reescalar acima disso.
    return L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 19, maxNativeZoom: 16 });
  }

  window.APP.initMap = function initMap() {
    const map = L.map("map", { zoomControl: true }).setView(window.APP.PORTUGAL_CENTER, window.APP.PORTUGAL_ZOOM);
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
    window.APP.PANES = {
      raster: "rasterPane",
      nuts2: "nuts2Pane",
      regionMask: "regionMaskPane",
      cells: "cellsPane",
    };

    fetch("data/nuts2.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        window.APP.nuts2Layer = L.geoJSON(geojson, {
          style: NUTS2_DEFAULT_STYLE,
          pane: window.APP.PANES.nuts2,
        }).addTo(map);
        // focusRegion/setRegionMask saem em silêncio (guarda de nuts2Layer)
        // se o utilizador mudar para "Esta região" antes deste fetch
        // terminar — achado do code-reviewer. Reaplica a seleção atual
        // assim que a camada estiver pronta, para não deixar a região
        // escolhida sem destaque/máscara até à próxima mudança de seletor.
        nuts2ReadyCallbacks.forEach((cb) => cb());
      })
      .catch((err) => console.error("Falha a carregar nuts2.geojson:", err));

    loadCellsLayer(map);

    return map;
  };

  // Camada de pontos da grelha ClimateEU — mesmo padrão de 2 pedidos (meta
  // depois GeoJSON) já usado em renderRaster (f4_raster.js) e renderChart
  // (f5_charts.js) para falar com a API/estático via window.APP.API_BASE.
  async function loadCellsLayer(map) {
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}/cells-grid`);
      if (!metaRes.ok) throw new Error(`Sem grelha de células (HTTP ${metaRes.status})`);
      const meta = await metaRes.json();

      const geojsonRes = await fetch(meta.url);
      const geojson = await geojsonRes.json();

      window.APP.cellsLayer = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, { ...CELL_DEFAULT_STYLE, pane: window.APP.PANES.cells }),
        // onEachFeature, não onEachLayer — essa opção não existe na API do
        // Leaflet (L.GeoJSON só reconhece onEachFeature); com o nome errado
        // a chave era ignorada silenciosamente, a camada carregava e
        // desenhava os pontos na mesma, mas nenhum listener de
        // click/mouseover/mouseout chegava a ser vinculado — achado real do
        // qa-engineer num browser, não visível em node --check nem em
        // testes que só confirmam "a camada carrega sem erro".
        // Sem mouseover/mouseout: os pontos nunca ganham destaque visual,
        // nem no hover (decisão de design) — só o clique continua a
        // disparar os callbacks registados em onCellClick.
        onEachFeature: (feature, layer) => {
          layer.on("click", () => {
            cellClickCallbacks.forEach((cb) => cb(feature.properties.id));
          });
        },
      }).addTo(map);
      // Sem bringToFront(): cellsPane tem o maior z-index fixo (ver
      // initMap), a camada fica sempre acima do raster/nuts2/máscara
      // independentemente da ordem de chegada dos fetches assíncronos.
    } catch (err) {
      console.error("Falha a carregar cells-grid:", err);
    }
  }

  // Regista um callback chamado com o cellId (properties.id) sempre que
  // uma célula da grelha é clicada — mesmo padrão de window.APP.onSelectionChange
  // em f3_controls.js.
  window.APP.onCellClick = function onCellClick(callback) {
    cellClickCallbacks.push(callback);
  };

  // Regista um callback chamado quando window.APP.nuts2Layer fica pronto
  // (fetch de data/nuts2.geojson resolvido) — ver nota acima sobre a
  // condição de corrida com focusRegion/setRegionMask.
  window.APP.onNuts2Ready = function onNuts2Ready(callback) {
    nuts2ReadyCallbacks.push(callback);
  };

  window.APP.toggleBasemap = function toggleBasemap() {
    currentBasemapKey = currentBasemapKey === "dark" ? "light" : "dark";
    window.APP.map.removeLayer(basemapLayer);
    basemapLayer = buildBasemapLayer(currentBasemapKey);
    basemapLayer.addTo(window.APP.map);
    basemapLayer.bringToBack();
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
  window.APP.focusRegion = function focusRegion(code) {
    if (!window.APP.nuts2Layer || !window.APP.map) return;
    let matched = null;
    window.APP.nuts2Layer.eachLayer((layer) => {
      const isMatch = code != null && layer.feature.properties.codigo === code;
      layer.setStyle(isMatch ? NUTS2_HIGHLIGHT_STYLE : NUTS2_DEFAULT_STYLE);
      if (isMatch) matched = layer;
    });
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
      interactive: false, // não deve bloquear clique nos pontos da grelha por baixo
      pane: window.APP.PANES.regionMask,
    }).addTo(window.APP.map);

    // Acima do raster/contorno NUTS II (regionMaskPane > rasterPane/
    // nuts2Pane em z-index, ver initMap) — a grelha de células continua
    // clicável por cima porque cellsPane tem z-index ainda maior, não por
    // causa da ordem de inserção. Sem bringToFront(): era exatamente essa
    // dependência de ordem de inserção/chamada que fazia o
    // currentLayer.bringToFront() assíncrono de renderRaster (f4_raster.js)
    // enterrar a máscara sempre que corria depois deste ponto (achado
    // real, ver comentário em initMap).
    window.APP.regionMaskLayer = regionMaskLayer; // exposto para inspeção/testes, mesmo padrão de nuts2Layer/cellsLayer
  };
})();
