// ============================================================================
// F5_CHARTS.JS — climatologias discretas de 30 anos (histórico + 3 períodos
// futuros × 2 cenários), não uma série anual contínua. Desenhado como
// barras agrupadas por período (Chart.js "bar"): um grupo "Histórico" com
// uma única barra (comum a ambos os cenários futuros) e três grupos
// "Início"/"Meados"/"Fim" com duas barras cada (SSP2-4.5 vs. SSP5-8.5) —
// nunca uma linha a ligar os pontos, que sugeriria continuidade temporal
// entre climatologias que não existe nos dados.
// ============================================================================

(function () {
  // 2 painéis independentes (região selecionada / célula clicada, ver
  // f7_main.js e index.html) — cada um com o seu próprio canvas e a sua
  // própria instância de Chart.js, para poderem estar visíveis os dois ao
  // mesmo tempo (antes havia 1 só canvas partilhado, com a célula clicada
  // a sobrepor transitoriamente a série regional).
  const CANVAS_IDS = { region: "chart-series", cell: "chart-series-cell" };
  const chartInstances = { region: null, cell: null };

  const PERIOD_ORDER = ["historico", "inicio", "meados", "fim"];
  const HIST_COLOR = "#a3a3a3";
  const SSP245_COLOR = "#3182bd";
  const SSP585_COLOR = "#e6550d";

  // Constrói os 3 datasets (Histórico / SSP2-4.5 / SSP5-8.5) a partir do
  // objeto "série" já resolvido (allIndicators[indicator], climatologias
  // discretas — ver f1 do prompt/schema). Cada dataset só tem valor não-nulo
  // nas categorias (períodos) a que pertence; Chart.js simplesmente não
  // desenha barra nenhuma nas categorias com `null`, o que dá o efeito de
  // "histórico é 1 barra isolada, os 2 cenários futuros divergem a partir
  // daí" sem inventar nenhuma ligação entre os pontos.
  function buildDatasets(series) {
    const hist = series.historico;
    const ssp245 = series.ssp245 || {};
    const ssp585 = series.ssp585 || {};

    return [
      {
        label: window.APP.SCENARIO_LABELS.historico,
        data: PERIOD_ORDER.map((p) => (p === "historico" ? hist : null)),
        backgroundColor: HIST_COLOR,
      },
      {
        label: window.APP.SCENARIO_LABELS.ssp245,
        data: PERIOD_ORDER.map((p) => (p === "historico" ? null : ssp245[p] ?? null)),
        backgroundColor: SSP245_COLOR,
      },
      {
        label: window.APP.SCENARIO_LABELS.ssp585,
        data: PERIOD_ORDER.map((p) => (p === "historico" ? null : ssp585[p] ?? null)),
        backgroundColor: SSP585_COLOR,
      },
    ];
  }

  // Lógica partilhada de construção do Chart.js a partir de um objeto
  // "série" já resolvido (allIndicators[indicator]) — usada tanto pela
  // série regional (renderChart) como pela série de uma célula individual
  // da grelha (renderChartForCell), que só diferem no endpoint pedido e no
  // slot ("region"/"cell", ver CANVAS_IDS/chartInstances acima) em que
  // desenham, para os 2 painéis poderem coexistir.
  function drawChart(series, indicator, slot) {
    const labels = PERIOD_ORDER.map((p) => window.APP.PERIOD_LABELS[p]);
    const datasets = buildDatasets(series);
    const unit = window.APP.INDICATORS[indicator].unit;

    if (chartInstances[slot]) chartInstances[slot].destroy();
    const ctx = document.getElementById(CANVAS_IDS[slot]).getContext("2d");
    chartInstances[slot] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        // false: o canvas segue a altura fixa de .chart-wrap (CSS) em
        // vez de a derivar da largura — com o gráfico agora a toda a
        // largura (ver #app em style.css), o comportamento por omissão
        // (true) dava uma altura cada vez mais pequena, o oposto do que
        // se queria ao tirá-lo da sidebar estreita.
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: "Período" },
            // Rótulos sempre na horizontal (1961–1990, 2011–2040, ...) —
            // por omissão o Chart.js roda-os na diagonal quando não cabem
            // na horizontal; a pedido do utilizador depois de ver os
            // rótulos inclinados em ecrã real. A coluna de gráficos mais
            // larga (ver #chart-column em style.css) dá espaço extra para
            // caberem sem sobreposição.
            ticks: { maxRotation: 0, minRotation: 0 },
          },
          y: { title: { display: true, text: unit } },
        },
        // Opções por omissão dos datasets "bar" deste gráfico (não por
        // dataset individual): barPercentage é a fração do espaço de cada
        // barra dentro do seu grupo, categoryPercentage é a fração do
        // espaço de cada grupo dentro da categoria/período — omissão do
        // Chart.js é 0.9/0.8, o que deixava muito espaço morto lateral
        // entre grupos. Subidos os dois para as barras ficarem mais
        // largas (a pedido do utilizador, mesmo abdicando espaço do mapa
        // para a coluna de gráficos em style.css).
        datasets: {
          bar: { barPercentage: 0.95, categoryPercentage: 0.9 },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${item.formattedValue} ${unit}`,
            },
          },
        },
      },
    });
  }

  // Busca meta+GeoJSON/JSON num endpoint no padrão {path,url} (mesmo
  // padrão de renderRaster em f4_raster.js) e desenha o gráfico no slot
  // indicado. `notFoundMessage`/`emptyMessage` só entram nas mensagens de
  // erro, para distinguir região vs. célula.
  async function fetchAndDraw(endpointPath, indicator, slot, notFoundMessage, emptyMessage) {
    if (window.APP.showLoading) window.APP.showLoading();
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}${endpointPath}`);
      if (!metaRes.ok) throw new Error(`${notFoundMessage} (HTTP ${metaRes.status})`);
      const meta = await metaRes.json();

      const seriesRes = await fetch(meta.url);
      const allIndicators = await seriesRes.json();
      const series = allIndicators[indicator];
      if (!series) throw new Error(emptyMessage);

      drawChart(series, indicator, slot);
    } catch (err) {
      if (window.APP.showError) window.APP.showError(err.message);
      console.error(err);
    } finally {
      if (window.APP.hideLoading) window.APP.hideLoading();
    }
  }

  // Painel 1 (sempre visível): série da região/nacional escolhida nos
  // seletores da sidebar.
  window.APP.renderChart = function renderChart(indicator, regionCode) {
    return fetchAndDraw(
      `/series/${regionCode}`,
      indicator,
      "region",
      `Sem série para a região '${regionCode}'`,
      `Sem dados de '${indicator}' para esta região`
    );
  };

  // Painel 2 (só depois de um clique no mapa): série de uma célula
  // individual da grelha ClimateEU (blocos de 5 km) — painel próprio, não
  // uma sobreposição do painel 1 (ver f7_main.js). Antes de desenhar,
  // troca o placeholder pelo conteúdo real (idempotente: chamado de novo
  // em cada clique/mudança de indicador só repete o mesmo troca, sem
  // efeito colateral visível).
  window.APP.renderChartForCell = function renderChartForCell(indicator, cellId) {
    const placeholder = document.getElementById("cell-chart-placeholder");
    const body = document.getElementById("cell-chart-body");
    if (placeholder) placeholder.hidden = true;
    if (body) body.hidden = false;

    return fetchAndDraw(
      `/cells/${cellId}`,
      indicator,
      "cell",
      `Sem série para a célula '${cellId}'`,
      `Sem dados de '${indicator}' para esta célula`
    );
  };

  // Chamada pela navegação por separadores mobile (ver
  // f6_ui.js::setMobileTab) ao ativar o separador "Gráficos" — necessária,
  // não só uma rede de segurança: confirmado com Playwright que o
  // ResizeObserver interno do Chart.js não corrige sozinho um canvas
  // desenhado enquanto o seu #chart-column ainda estava display:none (o
  // <canvas> fica com width/height inline presos a 0px). Ver nota em
  // f6_ui.js::setMobileTab para o achado completo.
  window.APP.resizeCharts = function resizeCharts() {
    Object.values(chartInstances).forEach((chart) => {
      if (chart) chart.resize();
    });
  };
})();
