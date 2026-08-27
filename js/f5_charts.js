// ============================================================================
// F5_CHARTS.JS — série anual 1970-2099: histórico até 2005, depois
// RCP4.5 e RCP8.5 como duas linhas divergentes a partir de 2006.
// ============================================================================

(function () {
  let chartInstance = null;

  function toPoints(years, values) {
    return years.map((year, i) => ({ x: year, y: values[i] }));
  }

  window.APP.renderChart = async function renderChart(indicator, regionCode) {
    if (window.APP.showLoading) window.APP.showLoading();
    try {
      const metaRes = await fetch(`${window.APP.API_BASE}/series/${regionCode}`);
      if (!metaRes.ok) throw new Error(`Sem série para a região '${regionCode}' (HTTP ${metaRes.status})`);
      const meta = await metaRes.json();

      const seriesRes = await fetch(meta.url);
      const allIndicators = await seriesRes.json();
      const series = allIndicators[indicator];
      if (!series) throw new Error(`Sem dados de '${indicator}' para esta região`);

      const datasets = [
        { label: "Histórico", data: toPoints(series.historico.years, series.historico.values), borderColor: "#a3a3a3", backgroundColor: "transparent", tension: 0.15 },
        { label: "RCP4.5", data: toPoints(series.rcp45.years, series.rcp45.values), borderColor: "#3182bd", backgroundColor: "transparent", tension: 0.15 },
        { label: "RCP8.5", data: toPoints(series.rcp85.years, series.rcp85.values), borderColor: "#e6550d", backgroundColor: "transparent", tension: 0.15 },
      ];

      const unit = window.APP.INDICATORS[indicator].unit;

      if (chartInstance) chartInstance.destroy();
      const ctx = document.getElementById("chart-series").getContext("2d");
      chartInstance = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: {
          parsing: false,
          scales: {
            x: { type: "linear", title: { display: true, text: "Ano" }, ticks: { stepSize: 10 } },
            y: { title: { display: true, text: unit } },
          },
          plugins: {
            annotation: {
              annotations: {
                fimHistorico: {
                  type: "line", xMin: 2005, xMax: 2005,
                  borderColor: "#666", borderWidth: 1, borderDash: [4, 4],
                  label: { display: true, content: "fim do histórico (2005)", position: "start" },
                },
              },
            },
          },
        },
      });
    } catch (err) {
      if (window.APP.showError) window.APP.showError(err.message);
      console.error(err);
    } finally {
      if (window.APP.hideLoading) window.APP.hideLoading();
    }
  };
})();
