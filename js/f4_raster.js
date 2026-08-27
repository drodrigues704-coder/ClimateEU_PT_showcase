// ============================================================================
// F4_RASTER.JS — isobandas do indicador/cenário/período selecionado.
// ============================================================================

(function () {
  let currentLayer = null;

  function renderLegend(indicator) {
    const ramp = window.APP.COLOR_RAMPS[indicator];
    const unit = window.APP.INDICATORS[indicator].unit;
    const legend = document.getElementById("raster-legend");
    legend.innerHTML = "";
    ramp.stops.forEach(([value, color]) => {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${value} ${unit}</span>`;
      legend.appendChild(row);
    });
  }

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
        style: (feature) => ({ fillColor: feature.properties.fill, color: feature.properties.fill, weight: 0, fillOpacity: 0.75 }),
      }).addTo(window.APP.map);
      currentLayer.bringToFront();
      if (window.APP.nuts2Layer) window.APP.nuts2Layer.bringToFront();

      renderLegend(indicator);
    } catch (err) {
      if (window.APP.showError) window.APP.showError(err.message);
      console.error(err);
    } finally {
      if (window.APP.hideLoading) window.APP.hideLoading();
    }
  };
})();
