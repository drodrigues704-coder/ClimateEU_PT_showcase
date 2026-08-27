// ============================================================================
// CORDEX PT WEBAPP — F1_CONFIG.JS
// Configuração partilhada por todos os outros módulos (f2_map.js em
// diante) — nada aqui faz pedidos de rede nem toca o DOM.
// ============================================================================

window.APP = {
  API_BASE: "api",

  // Espelha scripts/pipeline/p1_config.py -> INDICATORS (mesmas chaves,
  // mesmos rótulos/unidades) — se um mudar, mudar os dois.
  INDICATORS: {
    precipitacao: { label: "Precipitação total anual", unit: "mm/ano" },
    temp_media: { label: "Temperatura média anual", unit: "°C" },
    amplitude_termica: { label: "Amplitude térmica média", unit: "°C" },
    et0: { label: "ET0 (FAO Penman-Monteith)", unit: "mm/dia" },
    humidade: { label: "Humidade relativa média", unit: "%" },
    vento: { label: "Vento médio", unit: "m/s" },
    radiacao: { label: "Radiação solar média", unit: "W/m²" },
  },

  // Espelha p1_config.py -> PERIODS/SCENARIOS.
  SCENARIO_PERIODS: {
    historico: ["historico"],
    rcp45: ["meados", "fim"],
    rcp85: ["meados", "fim"],
  },
  PERIOD_LABELS: {
    historico: "1971–2005",
    meados: "2036–2065",
    fim: "2071–2100",
  },
  SCENARIO_LABELS: { historico: "Histórico", rcp45: "RCP4.5", rcp85: "RCP8.5" },

  // Basemaps CARTO (gratuitos, sem chave) — "Mapa: Escuro"/"Mapa: Claro",
  // mesmo padrão do Calor_Frio/SPI_SPEI (botão único a alternar).
  BASEMAPS: {
    dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: "© OpenStreetMap, © CARTO",
    },
    light: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: "© OpenStreetMap, © CARTO",
    },
  },

  // Espelha p1_config.py -> COLOR_RAMPS (só os "stops", para a legenda —
  // a cor de cada banda já vem embutida em properties.fill do GeoJSON).
  COLOR_RAMPS: {
    precipitacao: { stops: [[0, "#f7fbff"], [600, "#9ecae1"], [1200, "#3182bd"], [2400, "#08306b"]] },
    temp_media: { stops: [[8, "#ffffb2"], [12, "#feb24c"], [16, "#f03b20"], [20, "#800026"]] },
    amplitude_termica: { stops: [[4, "#f2f0f7"], [7, "#bcbddc"], [10, "#807dba"], [13, "#54278f"]] },
    et0: { stops: [[1.0, "#fff5eb"], [2.5, "#fdae6b"], [4.0, "#e6550d"], [5.5, "#7f2704"]] },
    humidade: { stops: [[55, "#f7fcfd"], [65, "#b2e2e2"], [75, "#66c2a4"], [90, "#006d2c"]] },
    vento: { stops: [[1, "#f7fcf5"], [3, "#a1d99b"], [5, "#31a354"], [8, "#00441b"]] },
    radiacao: { stops: [[120, "#ffffe5"], [160, "#fed976"], [190, "#f03b20"], [230, "#800026"]] },
  },

  PORTUGAL_CENTER: [39.6, -8.0],
  PORTUGAL_ZOOM: 7,
};
