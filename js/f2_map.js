// ============================================================================
// F2_MAP.JS — mapa base, alternância de basemap, contorno NUTS II.
// ============================================================================

(function () {
  let currentBasemapKey = "dark";
  let basemapLayer = null;

  function buildBasemapLayer(key) {
    const cfg = window.APP.BASEMAPS[key];
    return L.tileLayer(cfg.url, { attribution: cfg.attribution, subdomains: "abcd", maxZoom: 19 });
  }

  window.APP.initMap = function initMap() {
    const map = L.map("map", { zoomControl: true }).setView(window.APP.PORTUGAL_CENTER, window.APP.PORTUGAL_ZOOM);
    basemapLayer = buildBasemapLayer(currentBasemapKey);
    basemapLayer.addTo(map);
    window.APP.map = map;

    fetch("data/nuts2.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        window.APP.nuts2Layer = L.geoJSON(geojson, {
          style: { color: "#ffffff", weight: 1.5, fillOpacity: 0, opacity: 0.6 },
        }).addTo(map);
      })
      .catch((err) => console.error("Falha a carregar nuts2.geojson:", err));

    return map;
  };

  window.APP.toggleBasemap = function toggleBasemap() {
    currentBasemapKey = currentBasemapKey === "dark" ? "light" : "dark";
    window.APP.map.removeLayer(basemapLayer);
    basemapLayer = buildBasemapLayer(currentBasemapKey);
    basemapLayer.addTo(window.APP.map);
    basemapLayer.bringToBack();
    return currentBasemapKey;
  };
})();
