// ============================================================================
// F4_RASTER.JS — isobandas do indicador/cenário/período selecionado.
// ============================================================================

(function () {
  let currentLayer = null;

  // Rampa contínua (gradient CSS), não swatches discretos — .legend-bar/
  // .legend-labels já existiam em CSS/style.css mas nunca tinham sido
  // usadas (o legend-row/legend-swatch de antes não tinha estilo nenhum a
  // corresponder). A posição de cada stop dentro da barra é proporcional
  // ao seu valor no intervalo [min, max] dos stops da rampa (não
  // uniformemente espaçada) — para a barra refletir com fidelidade onde
  // cada cor começa/acaba em window.APP.COLOR_RAMPS[indicator].stops.
  function renderLegend(indicator) {
    const ramp = window.APP.COLOR_RAMPS[indicator];
    const unit = window.APP.INDICATORS[indicator].unit;
    const legend = document.getElementById("raster-legend");
    const stops = ramp.stops;
    const min = stops[0][0];
    const max = stops[stops.length - 1][0];
    const span = max - min || 1; // evita divisão por 0 no caso degenerado min === max

    const gradientStops = stops
      .map(([value, color]) => `${color} ${(((value - min) / span) * 100).toFixed(1)}%`)
      .join(", ");

    legend.innerHTML = `
      <div class="legend-bar" style="background: linear-gradient(to right, ${gradientStops})"></div>
      <div class="legend-labels"><span>${min} ${unit}</span><span>${max} ${unit}</span></div>
    `;
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
    if (window.APP.showLoading) window.APP.showLoading();
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}/raster/${indicator}/${scenario}/${period}`);
      if (!metaRes.ok) throw new Error(`Sem dados para ${indicator}/${scenario}/${period} (HTTP ${metaRes.status})`);
      const meta = await metaRes.json();

      const geojsonRes = await fetch(meta.url);
      const geojson = await geojsonRes.json();

      if (currentLayer) window.APP.map.removeLayer(currentLayer);
      currentLayer = L.geoJSON(geojson, {
        filter: window.APP.isPolygonFeature,
        pane: window.APP.PANES.raster,
        style: (feature) => ({ fillColor: feature.properties.fill, color: feature.properties.fill, weight: 0, fillOpacity: 0.75 }),
      }).addTo(window.APP.map);
      // Sem bringToFront(): rasterPane tem o z-index mais baixo dos 4
      // panes fixos (ver initMap em f2_map.js), por isso o contorno NUTS
      // II, a máscara de região e a grelha de células ficam sempre por
      // cima independentemente de quando este fetch assíncrono resolve —
      // antes dos panes, este bringToFront() (chamado sempre que o raster
      // muda, mesmo sem mudar de região) enterrava a máscara de região
      // sempre que corria depois de setRegionMask() no mesmo refresh()
      // (achado real, ver f2_map.js::initMap).

      renderLegend(indicator);
    } catch (err) {
      if (window.APP.showError) window.APP.showError(err.message);
      console.error(err);
    } finally {
      if (window.APP.hideLoading) window.APP.hideLoading();
    }
  };
})();
