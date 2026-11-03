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
  // Sem isto o Chart.js usa #666 e grelha quase preta, ilegíveis no painel
  // escuro (2,82:1 medido), e a sua fonte por omissão em vez da IBM Plex.
  // A guarda mantém o resto da app a funcionar se o CDN do Chart.js não
  // carregar; fetchAndDraw avisa e não desenha.
  if (window.Chart) {
    const rootStyle = getComputedStyle(document.documentElement);
    Chart.defaults.color = rootStyle.getPropertyValue("--text-dim").trim();
    Chart.defaults.borderColor = rootStyle.getPropertyValue("--panel-border").trim();
    Chart.defaults.font.family = rootStyle.getPropertyValue("--font-body").trim();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) Chart.defaults.animation = false;
  }

  // 2 painéis independentes (região selecionada / célula clicada, ver
  // f7_main.js e index.html) — cada um com o seu próprio canvas e a sua
  // própria instância de Chart.js, para poderem estar visíveis os dois ao
  // mesmo tempo (antes havia 1 só canvas partilhado, com a célula clicada
  // a sobrepor transitoriamente a série regional).
  const CANVAS_IDS = { region: "chart-series", cell: "chart-series-cell" };
  const chartInstances = { region: null, cell: null };
  const latestRequest = { region: 0, cell: 0 };
  const CHART_LIBRARY_MESSAGE = "Não foi possível carregar a biblioteca dos gráficos. Verifica a ligação e recarrega a página. O mapa continua a funcionar.";
  const numberFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 });

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

    // Contorno na barra do cenário e período que o mapa está a mostrar.
    const { scenario, period } = window.APP.getSelection();
    const selectedOutline = getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
    const borderWidthFor = (datasetScenario) => (ctx) =>
      datasetScenario === scenario && PERIOD_ORDER[ctx.dataIndex] === period ? 2 : 0;

    return [
      {
        label: window.APP.SCENARIO_LABELS.historico,
        data: PERIOD_ORDER.map((p) => (p === "historico" ? hist : null)),
        backgroundColor: HIST_COLOR,
        borderColor: selectedOutline,
        borderWidth: borderWidthFor("historico"),
      },
      {
        label: window.APP.SCENARIO_LABELS.ssp245,
        data: PERIOD_ORDER.map((p) => (p === "historico" ? null : ssp245[p] ?? null)),
        backgroundColor: SSP245_COLOR,
        borderColor: selectedOutline,
        borderWidth: borderWidthFor("ssp245"),
      },
      {
        label: window.APP.SCENARIO_LABELS.ssp585,
        data: PERIOD_ORDER.map((p) => (p === "historico" ? null : ssp585[p] ?? null)),
        backgroundColor: SSP585_COLOR,
        borderColor: selectedOutline,
        borderWidth: borderWidthFor("ssp585"),
      },
    ];
  }

  function describeSeries(datasets, labels, unit) {
    const parts = [];
    datasets.forEach((dataset) => {
      dataset.data.forEach((value, i) => {
        if (value != null) parts.push(`${dataset.label}, ${labels[i]}: ${numberFormat.format(value)} ${unit}`);
      });
    });
    return parts.join("; ");
  }

  // Lógica partilhada de construção do Chart.js a partir de um objeto
  // "série" já resolvido (allIndicators[indicator]) — usada tanto pela
  // série regional (renderChart) como pela série de uma célula individual
  // da grelha (renderChartForCell), que só diferem no endpoint pedido e no
  // slot ("region"/"cell", ver CANVAS_IDS/chartInstances acima) em que
  // desenham, para os 2 painéis poderem coexistir.
  function drawChart(series, indicator, slot, placeName) {
    const labels = PERIOD_ORDER.map((p) => window.APP.PERIOD_LABELS[p]);
    const datasets = buildDatasets(series);
    const unit = window.APP.INDICATORS[indicator].unit;

    if (chartInstances[slot]) chartInstances[slot].destroy();
    const { label: indicatorLabel } = window.APP.INDICATORS[indicator];
    document.getElementById(`chart-title-${slot}`).textContent = `${indicatorLabel} — ${placeName}`;
    const canvas = document.getElementById(CANVAS_IDS[slot]);
    canvas.setAttribute("aria-label", `${indicatorLabel}, ${placeName}. ${describeSeries(datasets, labels, unit)}`);
    const ctx = canvas.getContext("2d");
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
            // Letra mais pequena em gráficos estreitos (telemóvel, comparação): os
            // 4 rótulos ficam sempre visíveis, sem se sobreporem.
            ticks: {
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false,
              font: (ctx) => {
                const { width } = ctx.chart;
                return { size: width < 300 ? 9 : width < 420 ? 10 : 12 };
              },
            },
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

  function saveFile(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    // Não logo a seguir ao clique: o Safari em iOS ainda precisa do endereço.
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function seriesRows(indicator, place, series) {
    const { label, unit } = window.APP.INDICATORS[indicator];
    const periods = PERIOD_ORDER.map((p) => window.APP.PERIOD_LABELS[p]);
    const rows = [];
    buildDatasets(series).forEach((dataset) => {
      dataset.data.forEach((value, i) => {
        if (value != null) rows.push([label, place, dataset.label, periods[i], String(value).replace(".", ","), unit]);
      });
    });
    return rows;
  }

  // ";", vírgula decimal e BOM: abre com colunas e acentos certos no Excel em português.
  function saveCsv(rows, filename) {
    const csv = `\ufeff${rows.map((row) => row.join(";")).join("\r\n")}\r\n`;
    saveFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
  }

  // O indicador nas 7 regiões NUTS II e em Portugal Continental, seja qual for a
  // região selecionada.
  async function downloadNuts2Csv() {
    const { indicator } = window.APP.getSelection();
    const regions = [{ codigo: "nacional", nuts2: "Portugal Continental" }, ...window.APP.NUTS2_REGIONS];
    try {
      const allSeries = await Promise.all(
        regions.map(async ({ codigo }) => {
          const metaRes = await fetch(`${window.APP.API_BASE}/series/${codigo}`);
          if (!metaRes.ok) throw new Error(`series ${codigo}: HTTP ${metaRes.status}`);
          const meta = await metaRes.json();
          return (await (await fetch(meta.url)).json())[indicator];
        })
      );
      const header = ["Indicador", "Região", "Cenário", "Período", "Valor", "Unidade"];
      const rows = regions.flatMap(({ nuts2 }, i) => seriesRows(indicator, nuts2, allSeries[i]));
      saveCsv([header, ...rows], `climateeu_pt_${indicator}_nuts2.csv`);
    } catch (err) {
      console.error(err);
      window.APP.showError("Não foi possível preparar o CSV. Recarrega a página para tentar outra vez.");
    }
  }

  // Última série do ponto escolhido, para exportar. Um CSV de um só bloco de 5 km
  // leva as coordenadas, para o valor não se separar do sítio a que pertence.
  let cellExport = null;

  function downloadCellCsv() {
    const { series, indicator, cellId } = cellExport;
    const place = document.getElementById("cell-location").textContent;
    const header = ["Indicador", "Ponto", "Cenário", "Período", "Valor", "Unidade"];
    saveCsv([header, ...seriesRows(indicator, place, series)], `climateeu_pt_${indicator}_ponto_${cellId}.csv`);
  }

  const slugify = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const PNG_SCALE = 4;

  // Último gráfico desenhado por painel, para o nome do ficheiro PNG.
  const lastDrawn = { region: null, cell: null };

  // O canvas do Chart.js tem fundo transparente e texto claro, ilegível num
  // documento branco: o PNG leva o fundo do painel, o título e a fonte.
  function fitFontSize(ctx, text, maxWidth, size, weight, fontFamily, minSize) {
    let current = size;
    ctx.font = `${weight} ${current}px ${fontFamily}`;
    while (ctx.measureText(text).width > maxWidth && current > minSize) {
      current -= size / 30;
      ctx.font = `${weight} ${current}px ${fontFamily}`;
    }
  }

  function composeChartPng(chart, slot) {
    const source = chart.canvas;
    const scale = source.width / source.clientWidth;
    const style = getComputedStyle(document.documentElement);
    const fontFamily = style.getPropertyValue("--font-body").trim();
    const header = 40 * scale;
    const footer = 28 * scale;
    const margin = 12 * scale;

    const output = document.createElement("canvas");
    output.width = source.width + margin * 2;
    output.height = source.height + header + footer;
    const ctx = output.getContext("2d");
    ctx.fillStyle = style.getPropertyValue("--panel-bg").trim();
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(source, margin, header);

    const maxTextWidth = output.width - margin * 2;
    const title = document.getElementById(`chart-title-${slot}`).textContent;
    ctx.textBaseline = "middle";
    fitFontSize(ctx, title, maxTextWidth, 15 * scale, 600, fontFamily, 8 * scale);
    ctx.fillStyle = style.getPropertyValue("--text").trim();
    ctx.fillText(title, margin, header / 2);

    const place = slot === "cell" ? `${document.getElementById("cell-location").textContent}. ` : "";
    const source_note = `${place}Climatologias de 30 anos. Fonte: ClimateEU.`;
    fitFontSize(ctx, source_note, maxTextWidth, 11 * scale, 400, fontFamily, 6 * scale);
    ctx.fillStyle = style.getPropertyValue("--text-dim").trim();
    ctx.fillText(source_note, margin, output.height - footer / 2);
    return output;
  }

  // Redesenha em alta resolução, sem animação, só durante a cópia: a resolução do
  // ecrã (373 px de largura a 100%) não serve para relatórios nem impressão.
  function downloadChartPng(slot) {
    const chart = chartInstances[slot];
    const { indicator, placeName } = lastDrawn[slot];
    const suffix = slot === "cell" ? `ponto_${cellExport.cellId}` : slugify(placeName);
    let output;
    try {
      chart.stop();
      chart.options.devicePixelRatio = PNG_SCALE;
      chart.resize();
      chart.update("none");
      output = composeChartPng(chart, slot);
    } catch (err) {
      console.error(err);
      window.APP.showError("Não foi possível preparar a imagem do gráfico. Recarrega a página para tentar outra vez.");
    } finally {
      chart.options.devicePixelRatio = undefined; // volta a seguir o ecrã
      chart.resize();
      chart.update("none");
    }
    if (output) output.toBlob((blob) => saveFile(blob, `climateeu_pt_${indicator}_${suffix}.png`), "image/png");
  }

  document.getElementById("btn-csv").addEventListener("click", downloadNuts2Csv);
  document.getElementById("btn-csv-cell").addEventListener("click", downloadCellCsv);
  Object.keys(lastDrawn).forEach((slot) => {
    document.getElementById(`btn-png-${slot}`).addEventListener("click", () => downloadChartPng(slot));
  });

  function setChartError(slot, message) {
    const element = document.getElementById(`chart-error-${slot}`);
    element.textContent = message || "";
    element.hidden = !message;
  }

  // Busca meta+GeoJSON/JSON num endpoint no padrão {path,url} (mesmo padrão de
  // renderRaster em f4_raster.js) e desenha o gráfico no slot indicado. Devolve
  // a série, ou null se o pedido falhou ou já não é o mais recente deste slot.
  async function fetchAndDraw(endpointPath, indicator, slot, placeName) {
    const request = ++latestRequest[slot];
    if (window.APP.showLoading) window.APP.showLoading();
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}${endpointPath}`);
      if (!metaRes.ok) throw new Error(`${endpointPath}: HTTP ${metaRes.status}`);
      const meta = await metaRes.json();

      const seriesRes = await fetch(meta.url);
      const allIndicators = await seriesRes.json();
      const series = allIndicators[indicator];
      if (!series) throw new Error(`${endpointPath}: sem dados de ${indicator}`);
      if (request !== latestRequest[slot]) return null;

      // Devolve a série mesmo sem biblioteca: o valor no cartão do ponto não precisa dela.
      if (window.Chart) {
        drawChart(series, indicator, slot, placeName);
        setChartError(slot, null);
        lastDrawn[slot] = { indicator, placeName };
        document.getElementById(`btn-png-${slot}`).disabled = false;
      } else {
        setChartError(slot, CHART_LIBRARY_MESSAGE);
        if (window.APP.showError) window.APP.showError(CHART_LIBRARY_MESSAGE);
      }
      return series;
    } catch (err) {
      console.error(err);
      // Fica no painel: a mensagem tem de sobreviver ao fecho do aviso geral.
      if (request === latestRequest[slot]) {
        setChartError(slot, "Não foi possível carregar os dados deste gráfico. Recarrega a página para tentar outra vez.");
        // Sem o gráfico anterior à vista, com um título ou coordenadas que já não são dele.
        if (chartInstances[slot]) chartInstances[slot].destroy();
        chartInstances[slot] = null;
        document.getElementById(`btn-png-${slot}`).disabled = true;
      }
      return null;
    } finally {
      if (window.APP.hideLoading) window.APP.hideLoading();
    }
  }

  // Painel 1 (sempre visível): série da região/nacional escolhida nos
  // seletores da sidebar.
  window.APP.renderChart = function renderChart(indicator, regionCode, regionName) {
    return fetchAndDraw(`/series/${regionCode}`, indicator, "region", regionName);
  };

  // Painel 2 (só depois de um clique no mapa): série de uma célula individual
  // da grelha ClimateEU (blocos de 5 km) — painel próprio, não uma sobreposição
  // do painel 1 (ver f7_main.js).
  window.APP.renderChartForCell = async function renderChartForCell(indicator, cellId) {
    document.getElementById("cell-chart-placeholder").hidden = true;
    document.getElementById("cell-chart-body").hidden = false;
    // As coordenadas já são as do ponto novo: exportar agora juntava-as aos valores
    // do ponto anterior.
    cellExport = null;
    document.getElementById("btn-csv-cell").disabled = true;
    document.getElementById("btn-png-cell").disabled = true;
    const series = await fetchAndDraw(`/cells/${cellId}`, indicator, "cell", "ponto escolhido");
    if (series) {
      cellExport = { series, indicator, cellId };
      document.getElementById("btn-csv-cell").disabled = false;
    }
    return series;
  };

  window.APP.clearCellChart = function clearCellChart() {
    latestRequest.cell += 1;
    if (chartInstances.cell) chartInstances.cell.destroy();
    chartInstances.cell = null;
    cellExport = null;
    lastDrawn.cell = null;
    document.getElementById("btn-csv-cell").disabled = true;
    document.getElementById("btn-png-cell").disabled = true;
    setChartError("cell", null);
    document.getElementById("chart-title-cell").textContent = "Ponto escolhido no mapa";
    document.getElementById("cell-chart-placeholder").hidden = false;
    document.getElementById("cell-chart-body").hidden = true;
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
