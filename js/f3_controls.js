// ============================================================================
// F3_CONTROLS.JS — seletores de indicador/cenário/período/região.
// O período fica preso a "historico" quando o cenário é "historico" —
// nunca uma combinação "historico"+"meados" chega a pedir dados ao
// backend (que devolveria 404 — ver b4_api.py).
// ============================================================================

(function () {
  let changeCallbacks = [];

  function periodLabel(period) {
    return `${window.APP.PERIOD_LABELS[period]}${period !== "historico" ? " (" + period + ")" : ""}`;
  }

  function refreshPeriodOptions() {
    const scenario = document.getElementById("ctl-scenario").value;
    const periodSelect = document.getElementById("ctl-period");
    const allowed = window.APP.SCENARIO_PERIODS[scenario];

    periodSelect.innerHTML = "";
    allowed.forEach((period) => {
      const opt = document.createElement("option");
      opt.value = period;
      opt.textContent = periodLabel(period);
      periodSelect.appendChild(opt);
    });
    periodSelect.disabled = allowed.length === 1;
  }

  function refreshRegionVisibility() {
    const mode = document.querySelector('input[name="region-mode"]:checked').value;
    document.getElementById("ctl-nuts2-wrapper").hidden = mode !== "regiao";
  }

  window.APP.populateControls = function populateControls(nuts2Regions) {
    // O HTML já traz os 7 <option> de ctl-indicator hardcoded (para haver
    // algo visível antes do JS correr) — sem limpar primeiro, cada arranque
    // duplicava-os todos (14 em vez de 7, ver Task 23).
    const indicatorSelect = document.getElementById("ctl-indicator");
    indicatorSelect.innerHTML = "";
    Object.entries(window.APP.INDICATORS).forEach(([key, meta]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = meta.label;
      indicatorSelect.appendChild(opt);
    });

    // Mesma lógica para o placeholder "A carregar…" de ctl-nuts2.
    const nuts2Select = document.getElementById("ctl-nuts2");
    nuts2Select.innerHTML = "";
    nuts2Regions.forEach((region) => {
      const opt = document.createElement("option");
      opt.value = region.codigo;
      opt.textContent = region.nuts2;
      nuts2Select.appendChild(opt);
    });

    refreshPeriodOptions();
    refreshRegionVisibility();

    ["ctl-indicator", "ctl-scenario", "ctl-period", "ctl-nuts2"].forEach((id) => {
      document.getElementById(id).addEventListener("change", (e) => {
        if (e.target.id === "ctl-scenario") refreshPeriodOptions();
        changeCallbacks.forEach((cb) => cb(window.APP.getSelection()));
      });
    });
    document.querySelectorAll('input[name="region-mode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        refreshRegionVisibility();
        changeCallbacks.forEach((cb) => cb(window.APP.getSelection()));
      });
    });
  };

  window.APP.getSelection = function getSelection() {
    const regionMode = document.querySelector('input[name="region-mode"]:checked').value;
    return {
      indicator: document.getElementById("ctl-indicator").value,
      scenario: document.getElementById("ctl-scenario").value,
      period: document.getElementById("ctl-period").value,
      regionMode,
      nuts2Code: regionMode === "regiao" ? document.getElementById("ctl-nuts2").value : null,
    };
  };

  window.APP.onSelectionChange = function onSelectionChange(callback) {
    changeCallbacks.push(callback);
  };
})();
