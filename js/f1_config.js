// ============================================================================
// CLIMATEEU PT WEBAPP — F1_CONFIG.JS
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
    temp_media: { label: "Temperatura média anual", unit: "°C", legendNote: "Inclui correção local de altitude (DEM)." },
    amplitude_termica: { label: "Amplitude térmica média", unit: "°C", legendNote: "Amplitude diurna: Tmax menos Tmin." },
    et0: { label: "ET0 (Hargreaves)", unit: "mm/dia" },
    defice_hidrico: { label: "Défice hídrico climático", unit: "mm/ano" },
    graus_dia_5: { label: "Graus-dia acima de 5°C", unit: "°C·dia/ano", legendNote: "Soma, ao longo do ano, dos graus acima de 5 °C em cada dia: um dia a 15 °C conta 10." },
    graus_dia_18: { label: "Graus-dia acima de 18°C", unit: "°C·dia/ano", legendNote: "Soma, ao longo do ano, dos graus acima de 18 °C em cada dia: um dia a 25 °C conta 7. Procura potencial de arrefecimento, não consumo." },
    dias_sem_geada: { label: "Dias sem geada", unit: "dias/ano", legendNote: "Mais escuro = mais geada. Valores estimados, não contagens." },
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
      land: "#414143", // cor da terra nos tiles, usada nas amostras da legenda
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
    },
    light: {
      land: "#efefef",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
    },
  },

  // Capitais de distrito, em português, por cima das isobandas: os nomes dos
  // tiles Esri ficam tapados pelo raster e vêm em inglês. Coordenadas do
  // OpenStreetMap (Nominatim).
  PLACE_LABELS: [
    ["Viana do Castelo", 41.718, -8.764],
    ["Braga", 41.551, -8.428],
    ["Porto", 41.15, -8.61],
    ["Vila Real", 41.298, -7.746],
    ["Bragança", 41.807, -6.759],
    ["Aveiro", 40.64, -8.654],
    ["Viseu", 40.657, -7.914],
    ["Guarda", 40.538, -7.266],
    ["Coimbra", 40.211, -8.429],
    ["Leiria", 39.744, -8.807],
    ["Castelo Branco", 39.827, -7.492],
    ["Santarém", 39.236, -8.687],
    ["Lisboa", 38.708, -9.137],
    ["Setúbal", 38.524, -8.893],
    ["Portalegre", 39.291, -7.433],
    ["Évora", 38.571, -7.909],
    ["Beja", 38.015, -7.865],
    ["Faro", 37.016, -7.935],
  ],

  PORTUGAL_CENTER: [39.6, -8.0],
  PORTUGAL_ZOOM: 7,
};
