# ClimateEU PT — Projeções Climáticas Regionais

<!-- Demo: https://drodrigues704-coder.github.io/ClimateEU_PT_showcase/ (ativar GitHub Pages neste repositório antes de publicar este link) -->

Atlas de indicadores climáticos para **Portugal Continental**, a partir do
downscaling estatístico **ClimateEU** (rede neuronal treinada sobre um
ensemble de 8 GCMs CMIP6, grelha Albers Equal Area 1 km).

Este repositório é uma **demonstração pública** — contém a app já construída
(frontend) e um instantâneo dos resultados já calculados, para correr sem
servidor (GitHub Pages). O pipeline de dados, os dados brutos e o histórico
de desenvolvimento ficam num repositório privado.

## O que a app mostra

- **8 indicadores climáticos**: precipitação total anual, temperatura média
  anual, amplitude térmica média, ET0 (evapotranspiração de referência,
  método Hargreaves), défice hídrico climático, graus-dia acima de 5°C,
  graus-dia acima de 18°C e dias sem geada
- Cobertura de **Portugal Continental**, com séries temporais por
  **NUTS II** (Norte, Centro, Grande Lisboa, Península de Setúbal,
  Alentejo, Algarve e Oeste e Vale do Tejo) e a nível nacional, além de
  séries por célula da grelha de 5 km ao clicar no mapa
- Três cenários — **histórico** (normal climática 1961–1990) e as duas
  trajetórias de emissões **SSP2-4.5** e **SSP5-8.5**
- Três janelas temporais futuras — início (2011–2040), meados (2041–2070)
  e fim do século (2071–2100)
- Mapa espacial (isobandas) para cada combinação indicador/cenário/período,
  e gráficos de climatologia por região e por célula

## Metodologia (resumo)

- **Fonte**: [ClimateEU](https://sites.ualberta.ca/~ahamann/data/climateeu.html)
  (Alberta Biodiversity / T. Hamann) — downscaling estatístico por rede
  neuronal sobre a média de um ensemble de 8 GCMs CMIP6, grelha regular
  Albers Equal Area a 1 km, com correção por lapse-rate de elevação já
  embutida no próprio downscaling
- **ET0**: variável `Eref` do próprio ClimateEU (método Hargreaves), sem
  necessidade de campos diários adicionais
- **Correção local por lapse-rate**: aplicada só à temperatura média
  (`temp_media`), usando um DEM de 25 m de Portugal Continental — técnica
  delta/anomalia (Daly et al. 2002, PRISM; Wang et al. 2016, ClimateNA), não
  uma resimulação física. Os restantes indicadores não recebem esta
  correção (amplitude térmica cancela-a algebricamente; graus-dia, dias sem
  geada, precipitação, défice hídrico e ET0 não são dimensionalmente
  compatíveis com um delta aditivo em °C)
- **Aviso**: o histórico é uma normal climática interpolada (observação/
  reanálise), não uma simulação do clima passado; a fonte exata da
  reanálise subjacente não está confirmada nos metadados do dataset

## Stack

| Camada | Tecnologia |
|---|---|
| Pipeline de dados (privado) | Python · rasterio/GDAL · numpy · geopandas/shapely · matplotlib/geojsoncontour · pyproj |
| Frontend (este repositório) | JavaScript vanilla · Leaflet · Chart.js |
| Dados | GeoJSON (isobandas), JSON (séries temporais, catálogo) |

## Nota sobre este repositório

Este é um instantâneo estático para demonstração — não corre o pipeline, não
recalcula nada, e não inclui os dados brutos ClimateEU nem o código de
processamento. Todos os direitos reservados; não é software de código
aberto.

---

Daniel Rodrigues
