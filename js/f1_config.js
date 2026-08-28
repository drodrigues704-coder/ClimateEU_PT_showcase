// ============================================================================
// CORDEX PT WEBAPP — F1_CONFIG.JS
// Configuração partilhada por todos os outros módulos (f2_map.js em
// diante) — nada aqui faz pedidos de rede nem toca o DOM.
// ============================================================================

window.APP = {
  API_BASE: "api",

  // Espelha scripts/pipeline/p1_config.py -> INDICATORS (mesmas chaves,
  // mesmos rótulos/unidades) — se um mudar, mudar os dois. Fonte de dados:
  // ClimateEU (downscaling estatístico, 1 km nativo, agregado a blocos de
  // 5 km), não CORDEX EUR-11 — ver painel "Sobre".
  INDICATORS: {
    precipitacao: { label: "Precipitação total anual", unit: "mm/ano" },
    temp_media: { label: "Temperatura média anual", unit: "°C" },
    amplitude_termica: { label: "Amplitude térmica média", unit: "°C" },
    et0: { label: "ET0 (Hargreaves)", unit: "mm/dia" },
    defice_hidrico: { label: "Défice hídrico climático", unit: "mm/ano" },
    graus_dia_5: { label: "Graus-dia acima de 5°C", unit: "°C·dia/ano" },
    graus_dia_18: { label: "Graus-dia acima de 18°C", unit: "°C·dia/ano" },
    dias_sem_geada: { label: "Dias sem geada", unit: "dias/ano" },
  },

  // Espelha p1_config.py -> PERIODS/SCENARIOS. Climatologias discretas de
  // 30 anos, não uma série anual: "historico" só tem o período "historico"
  // (comum aos 2 cenários futuros); ssp245/ssp585 têm 3 períodos cada.
  SCENARIO_PERIODS: {
    historico: ["historico"],
    ssp245: ["inicio", "meados", "fim"],
    ssp585: ["inicio", "meados", "fim"],
  },
  PERIOD_LABELS: {
    historico: "1961–1990",
    inicio: "2011–2040",
    meados: "2041–2070",
    fim: "2071–2100",
  },
  SCENARIO_LABELS: { historico: "Histórico", ssp245: "SSP2-4.5", ssp585: "SSP5-8.5" },

  // Basemaps Esri Canvas (gratuitos, sem chave) — "Mapa: Escuro"/"Mapa:
  // Claro", mesmo padrão do Calor_Frio/SPI_SPEI (botão único a alternar).
  // A CARTO usada antes exigia agora API key (endpoint raster anónimo foi
  // descontinuado — pedidos sem chave devolvem um tile com marca de água
  // "API key required"). Estes tiles ArcGIS REST vão até zoom nativo 16;
  // maxZoom 19 deixa o Leaflet reescalar acima disso (maxNativeZoom).
  BASEMAPS: {
    dark: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
    },
    light: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
    },
  },

  // Espelha p1_config.py -> COLOR_RAMPS (só os "stops", para a legenda —
  // a cor de cada banda já vem embutida em properties.fill do GeoJSON).
  COLOR_RAMPS: {
    precipitacao: { stops: [[300, "#f7fbff"], [900, "#9ecae1"], [1600, "#3182bd"], [2400, "#08306b"]] },
    temp_media: { stops: [[0, "#ffffb2"], [8, "#feb24c"], [16, "#f03b20"], [24, "#800026"]] },
    amplitude_termica: { stops: [[4, "#f2f0f7"], [7, "#bcbddc"], [10, "#807dba"], [14, "#54278f"]] },
    et0: { stops: [[1.5, "#fff5eb"], [2.3, "#fdae6b"], [3.2, "#e6550d"], [4.0, "#7f2704"]] },
    defice_hidrico: { stops: [[100, "#f7fcfd"], [450, "#b2e2e2"], [800, "#66c2a4"], [1200, "#006d2c"]] },
    graus_dia_5: { stops: [[1000, "#ffffe5"], [2800, "#fed976"], [4600, "#f03b20"], [6500, "#800026"]] },
    graus_dia_18: { stops: [[0, "#f7fcf5"], [750, "#a1d99b"], [1500, "#31a354"], [2300, "#00441b"]] },
    dias_sem_geada: { stops: [[200, "#fff7ec"], [270, "#fdbe85"], [320, "#e6550d"], [365, "#7f2704"]] },
  },

  PORTUGAL_CENTER: [39.6, -8.0],
  PORTUGAL_ZOOM: 7,
};
