# CORDEX PT — Projeções Climáticas Regionais

<!-- Demo: https://drodrigues704-coder.github.io/cordex-pt-showcase/ (ativar GitHub Pages neste repositório antes de publicar este link) -->

Webapp de projeções climáticas regionais para **Portugal Continental**, a partir do downscaling regional **CORDEX EUR-11** (grelha ~0.11°, ~12 km).

Este repositório é uma **demonstração pública** — contém a app já construída (frontend) e um instantâneo dos resultados já calculados, para correr sem servidor (GitHub Pages). O pipeline de dados, os dados brutos NetCDF e o histórico de desenvolvimento ficam num repositório privado.

## O que a app mostra

- **7 indicadores climáticos**: precipitação total anual, temperatura média anual, amplitude térmica média, ET0 (evapotranspiração de referência, FAO Penman-Monteith), humidade relativa média, vento médio e radiação solar média
- Cobertura de **Portugal Continental**, com séries temporais por **NUTS II** (Norte, Centro, Grande Lisboa, Península de Setúbal, Alentejo, Algarve, Oeste e Vale do Tejo) e a nível nacional
- Três cenários — **histórico** e as duas trajetórias de emissões **RCP4.5** e **RCP8.5**
- Três janelas temporais — histórico (1971–2005), meados do século (2036–2065) e fim do século (2071–2100)
- Mapa espacial (isobandas) para cada combinação indicador/cenário/período, e gráficos de série temporal por região

## Metodologia (resumo)

- **Fonte**: CORDEX EUR-11 (domínio Europa, grelha rotativa 412×424 células a 0.11°), 7 variáveis brutas (hurs, pr, rsds, sfcWind, tas, tasmax, tasmin) nos 3 cenários
- **ET0**: FAO-56 Penman-Monteith (Allen et al., 1998), diária, calculada a partir de tasmax, tasmin, hurs (média), sfcWind (a 10 m) e rsds — com duas simplificações deliberadas, por não haver DEM (modelo digital de terreno) disponível nesta versão:
  1. Radiação de céu limpo (Rso) = 0.75 × Ra (eq. 37 do FAO-56, sem o termo de correção de altitude, que o próprio FAO-56 descreve como menor)
  2. Pressão atmosférica ao nível do mar (z = 0) para a constante psicrométrica, em vez de por célula
- **Aviso sobre o RCM**: o histórico e o RCP8.5 usam o mesmo modelo climático regional (SMHI-RCA4); o RCP4.5 usa um RCM diferente (KNMI-RACMO22E). As diferenças entre RCP4.5 e os outros dois cenários refletem, em parte, essa diferença de modelo — não só a diferença de forçamento radiativo — e devem ser interpretadas com essa reserva.

## Stack

| Camada | Tecnologia |
|---|---|
| Pipeline de dados (privado) | Python · xarray · numpy/pandas · geopandas/shapely · matplotlib/geojsoncontour · pyproj |
| Frontend (este repositório) | JavaScript vanilla · Leaflet · Chart.js |
| Dados | GeoJSON (isobandas), JSON (séries temporais, catálogo) |

## Nota sobre este repositório

Este é um instantâneo estático para demonstração — não corre o pipeline, não recalcula nada, e não inclui os dados brutos CORDEX (NetCDF) nem o código de processamento. Todos os direitos reservados; não é software de código aberto.

---

Daniel Rodrigues
