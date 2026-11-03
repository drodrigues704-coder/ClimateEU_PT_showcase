// ============================================================================
// F4_RASTER.JS — isobandas do indicador/cenário/período selecionado.
// ============================================================================

(function () {
  let currentLayer = null;
  let latestRequest = 0;

  // Igual no mapa e nas amostras da legenda, que misturam a cor com a terra
  // do mapa de fundo (--basemap-land) para coincidirem com o que se vê.
  const RASTER_FILL_OPACITY = 0.75;
  const numberFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

  // Uma linha por classe, com os limites reais das isobandas (mesmos valores
  // e cores do `fill` no GeoJSON, ver color_scales em catalog.json), da classe
  // mais alta para a mais baixa. O cenário e o período ficam na legenda para o
  // mapa se ler sem olhar para os seletores.
  function renderLegend(indicator, scenario, period) {
    const { levels, colors, labels } = window.APP.COLOR_SCALES[indicator];
    const { unit, legendNote } = window.APP.INDICATORS[indicator];
    const fillPercent = RASTER_FILL_OPACITY * 100;
    const rows = colors
      .map((color, i) => {
        const range = `${numberFormat.format(levels[i])}–${numberFormat.format(levels[i + 1])}`;
        return `
        <li>
          <span class="legend-swatch" style="background: color-mix(in srgb, ${color} ${fillPercent}%, var(--basemap-land))"></span>
          <span>${labels?.[i] ?? range}</span>
        </li>`;
      })
      .reverse()
      .join("");

    const scenarioPeriod = `${window.APP.SCENARIO_LABELS[scenario]}, ${window.APP.PERIOD_LABELS[period]}`;
    const legendHtml = `
      <p class="legend-unit">${unit}</p>
      <ol class="legend-classes">${rows}</ol>
      <p class="note">${scenarioPeriod}. Fonte: ClimateEU. Classes fixas em todos os cenários.${legendNote ? ` ${legendNote}` : ""}</p>
    `;
    // A mesma legenda na barra lateral e por cima do mapa em ecrãs estreitos,
    // onde a barra lateral fica noutro separador.
    document.getElementById("raster-legend").innerHTML = legendHtml;
    document.getElementById("map-legend").innerHTML = legendHtml;
    const summary = `${window.APP.INDICATORS[indicator].label}: ${scenarioPeriod}`;
    document.getElementById("map-summary-text").textContent = summary;
    document.getElementById("map-status").textContent = `Mapa atualizado. ${summary}.`;
  }

  // Defesa adicional no frontend: mesmo que o pipeline garanta geometrias
  // limpas na origem, o L.geoJSON nunca deve desenhar nada que não seja
  // Polygon/MultiPolygon — qualquer Point/LineString/GeometryCollection
  // residual cai no marcador azul por omissão do Leaflet (pins a flutuar
  // sobre o mapa) porque não há pointToLayer definido. Exposta em
  // window.APP para ser testável isoladamente do Leaflet.
  window.APP.isPolygonFeature = function isPolygonFeature(feature) {
    const type = feature && feature.geometry && feature.geometry.type;
    return type === "Polygon" || type === "MultiPolygon";
  };

  window.APP.renderRaster = async function renderRaster(indicator, scenario, period) {
    // Só a resposta do pedido mais recente chega ao mapa: com a rede lenta, uma
    // resposta atrasada deixava mapa e legenda noutro período que não o escolhido.
    const request = ++latestRequest;
    if (window.APP.showLoading) window.APP.showLoading();
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}/raster/${indicator}/${scenario}/${period}`);
      if (!metaRes.ok) throw new Error(`Sem dados para ${indicator}/${scenario}/${period} (HTTP ${metaRes.status})`);
      const meta = await metaRes.json();

      const geojsonRes = await fetch(meta.url);
      const geojson = await geojsonRes.json();
      if (request !== latestRequest) return;

      if (currentLayer) window.APP.map.removeLayer(currentLayer);
      currentLayer = L.geoJSON(geojson, {
        filter: window.APP.isPolygonFeature,
        pane: window.APP.PANES.raster,
        // weight: 0 (sem stroke) deixava uma fresta fina e visível na
        // costura entre <path> SVG vizinhos — o anti-aliasing de cada
        // polígono não "cose" com o do vizinho sem um traço a cobri-la.
        // weight: 1 com color igual a fillColor desenha um contorno da
        // mesma cor do preenchimento — invisível como "linha" (não
        // introduz uma cor nova), mas fecha a fresta entre polígonos
        // adjacentes; fillOpacity mantém-se em RASTER_FILL_OPACITY (decisão de design
        // intencional, deixa ver o basemap por baixo). opacity (do
        // stroke) igualada a fillOpacity — sem isto o Leaflet usa 1.0 por
        // omissão, o que desenhava um anel ligeiramente mais saturado que
        // o preenchimento à volta de cada polígono (achado do
        // code-reviewer).
        style: (feature) => ({
          fillColor: feature.properties.fill,
          color: feature.properties.fill,
          weight: 1,
          opacity: RASTER_FILL_OPACITY,
          fillOpacity: RASTER_FILL_OPACITY,
        }),
      }).addTo(window.APP.map);
      // Sem bringToFront(): rasterPane tem o z-index mais baixo dos 4
      // panes fixos (ver initMap em f2_map.js), por isso o contorno NUTS
      // II, a máscara de região e a grelha de células ficam sempre por
      // cima independentemente de quando este fetch assíncrono resolve —
      // antes dos panes, este bringToFront() (chamado sempre que o raster
      // muda, mesmo sem mudar de região) enterrava a máscara de região
      // sempre que corria depois de setRegionMask() no mesmo refresh()
      // (achado real, ver f2_map.js::initMap).

      renderLegend(indicator, scenario, period);
    } catch (err) {
      if (request === latestRequest && window.APP.showError) {
        window.APP.showError("Não foi possível carregar o mapa deste indicador. Recarrega a página para tentar outra vez.");
      }
      console.error(err);
    } finally {
      if (window.APP.hideLoading) window.APP.hideLoading();
    }
  };
})();
