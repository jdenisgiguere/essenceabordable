<template>
  <div class="route-shell">
    <div class="loading-overlay" :class="{ hidden: !isLoading }">
      <div class="spinner"></div>
      <div class="loading-text">Chargement des stations…</div>
    </div>

    <div class="header-bar">
      <div class="header-left">
        <div class="brand">
          <div class="brand-icon">⛽</div>
          <div>
            <h1>Où l'essence est-elle abordable au Québec?</h1>
            <p>Clusters par prix minimum</p>
          </div>
        </div>
        <div v-if="localities.length" class="geocoder">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Rechercher une localité…"
            autocomplete="off"
            @input="onSearchInput"
            @blur="onSearchBlur"
            @keydown.down.prevent="highlightNext"
            @keydown.up.prevent="highlightPrev"
            @keydown.enter.prevent="selectHighlighted"
            @keydown.escape="showSuggestions = false"
          />
          <ul v-if="showSuggestions && searchSuggestions.length" class="geocoder-suggestions">
            <li
              v-for="(s, i) in searchSuggestions"
              :key="s.name"
              :class="{ active: i === highlightIndex }"
              @mousedown.prevent="selectLocality(s)"
            >{{ s.name }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="info-chip">
      <div class="count">{{ stationCount }}</div>
      <div class="label">stations</div>
    </div>

    <div ref="mapElement" class="map"></div>

    <div class="legend-bar">
      <span class="legend-title">Prix min.</span>
      <div class="legend-gradient">
        <span>{{ legendMin }}</span>
        <div class="bar"></div>
        <span>{{ legendMax }}</span>
      </div>
      <div class="gas-select-group">
        <button
          v-for="gasType in GAS_TYPES"
          :key="gasType"
          class="gas-btn"
          :class="{ active: gasType === currentGasType }"
          @click="currentGasType = gasType"
        >
          {{ gasType }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import { buildColorExpr, COLOR_STOPS, GAS_TYPES, preprocessData } from '../utils/mapPricing';
import { generateSampleData } from '../utils/sampleData';

const mapElement = ref(null);
const map = shallowRef(null);
const geojsonData = shallowRef(null);
const currentGasType = ref('Régulier');
const stationCount = ref('—');
const isLoading = ref(true);
const legendMin = ref('130.0¢');
const legendMax = ref('200.0¢');

const localities = shallowRef([]);
const searchQuery = ref('');
const searchSuggestions = ref([]);
const showSuggestions = ref(false);
const highlightIndex = ref(-1);

let moveEndHandler = null;
let zoomEndHandler = null;
let clusterClickHandler = null;
let stationClickHandler = null;
let clusterEnterHandler = null;
let clusterLeaveHandler = null;
let stationEnterHandler = null;
let stationLeaveHandler = null;

function getVisiblePriceExtent() {
  if (!map.value || !map.value.getLayer('station-point')) {
    return null;
  }

  const features = map.value.queryRenderedFeatures({ layers: ['station-point'] });
  const prices = features
    .map((feature) => Number(feature.properties?._price))
    .filter((value) => Number.isFinite(value));

  if (!prices.length) {
    return null;
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices)
  };
}

function updateViewportColorScale() {
  if (!map.value || !map.value.getLayer('station-point') || !map.value.getLayer('clusters')) {
    return;
  }

  const extent = getVisiblePriceExtent();
  if (!extent) {
    return;
  }

  map.value.setPaintProperty(
    'station-point',
    'circle-color',
    buildColorExpr('_price', extent.min, extent.max)
  );

  map.value.setPaintProperty(
    'clusters',
    'circle-color',
    buildColorExpr('min_price', extent.min, extent.max)
  );

  legendMin.value = `${extent.min.toFixed(1)}¢`;
  legendMax.value = `${extent.max.toFixed(1)}¢`;
}

function detachMapEvents() {
  if (!map.value) {
    return;
  }

  if (moveEndHandler) {
    map.value.off('moveend', moveEndHandler);
    moveEndHandler = null;
  }

  if (zoomEndHandler) {
    map.value.off('zoomend', zoomEndHandler);
    zoomEndHandler = null;
  }

  if (clusterClickHandler && map.value.getLayer('clusters')) {
    map.value.off('click', 'clusters', clusterClickHandler);
  }

  if (stationClickHandler && map.value.getLayer('station-point')) {
    map.value.off('click', 'station-point', stationClickHandler);
  }

  if (clusterEnterHandler && map.value.getLayer('clusters')) {
    map.value.off('mouseenter', 'clusters', clusterEnterHandler);
  }

  if (clusterLeaveHandler && map.value.getLayer('clusters')) {
    map.value.off('mouseleave', 'clusters', clusterLeaveHandler);
  }

  if (stationEnterHandler && map.value.getLayer('station-point')) {
    map.value.off('mouseenter', 'station-point', stationEnterHandler);
  }

  if (stationLeaveHandler && map.value.getLayer('station-point')) {
    map.value.off('mouseleave', 'station-point', stationLeaveHandler);
  }

  clusterClickHandler = null;
  stationClickHandler = null;
  clusterEnterHandler = null;
  clusterLeaveHandler = null;
  stationEnterHandler = null;
  stationLeaveHandler = null;
}

function applyData(gasType) {
  if (!map.value || !geojsonData.value || !map.value.isStyleLoaded()) {
    return;
  }

  const processed = preprocessData(geojsonData.value, gasType);
  stationCount.value = processed.features.length.toLocaleString('fr-CA');

  detachMapEvents();

  if (map.value.getLayer('cluster-label')) map.value.removeLayer('cluster-label');
  if (map.value.getLayer('clusters')) map.value.removeLayer('clusters');
  if (map.value.getLayer('station-label')) map.value.removeLayer('station-label');
  if (map.value.getLayer('station-point')) map.value.removeLayer('station-point');
  if (map.value.getSource('stations')) map.value.removeSource('stations');

  map.value.addSource('stations', {
    type: 'geojson',
    data: processed,
    cluster: true,
    clusterMaxZoom: 8,
    clusterRadius: 25,
    clusterProperties: {
      min_price: ['min', ['get', '_price']]
    }
  });

  const clusterColorExpr = ['interpolate', ['linear'], ['get', 'min_price'],
    ...COLOR_STOPS.flatMap(([value, color]) => [value, color])
  ];

  const pointColorExpr = ['interpolate', ['linear'], ['get', '_price'],
    ...COLOR_STOPS.flatMap(([value, color]) => [value, color])
  ];

  map.value.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'stations',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColorExpr,
      'circle-opacity': 0.85,
      'circle-radius': ['step', ['get', 'point_count'], 18, 5, 22, 20, 28, 100, 36],
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(0,0,0,0.3)'
    }
  });

  map.value.addLayer({
    id: 'cluster-label',
    type: 'symbol',
    source: 'stations',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['concat', ['get', 'min_price'], '¢'],
      'text-size': 24,
      'text-allow-overlap': true
    },
    paint: {
      'text-color': '#fff',
      'text-halo-color': 'rgba(0,0,0,0.6)',
      'text-halo-width': 1
    }
  });

  map.value.addLayer({
    id: 'station-point',
    type: 'circle',
    source: 'stations',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': pointColorExpr,
      'circle-radius': 7,
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(0,0,0,0.4)',
      'circle-opacity': 0.9
    }
  });

  map.value.addLayer({
    id: 'station-label',
    type: 'symbol',
    source: 'stations',
    filter: ['!', ['has', 'point_count']],
    minzoom: 8,
    layout: {
      'text-field': [
        'concat',
        ['number-format', ['get', '_price'], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }],
        '¢'
      ],
      'text-size': 14,
      'text-offset': [0, 1.6]
    },
    paint: {
      'text-color': '#e4e4e7',
      'text-halo-color': 'rgba(12,14,19,0.8)',
      'text-halo-width': 1
    }
  });

  moveEndHandler = () => updateViewportColorScale();
  zoomEndHandler = () => updateViewportColorScale();
  map.value.on('moveend', moveEndHandler);
  map.value.on('zoomend', zoomEndHandler);

  clusterClickHandler = (event) => {
    const features = map.value.queryRenderedFeatures(event.point, { layers: ['clusters'] });
    if (!features.length) {
      return;
    }

    const clusterId = features[0].properties.cluster_id;
    map.value.getSource('stations').getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error) {
        return;
      }

      map.value.easeTo({ center: features[0].geometry.coordinates, zoom });
    });
  };

  stationClickHandler = (event) => {
    const feature = event.features[0];
    const props = feature.properties;
    let prices;

    try {
      prices = JSON.parse(props.Prices);
    } catch {
      prices = [];
    }

    const priceRows = prices.map((price) => {
      const isHighlight = price.GasType === gasType;
      return `<div class="popup-price-row ${isHighlight ? 'highlight' : ''}">
        <span class="popup-gas-type">${price.GasType}</span>
        <span class="popup-price-val">${price.Price}</span>
      </div>`;
    }).join('');

    new maplibregl.Popup({ offset: 12, maxWidth: '280px' })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(`
        <div class="popup-name">${props.Name || 'Station'}</div>
        <div class="popup-brand">${props.brand || ''}</div>
        <div class="popup-address">${props.Address || ''}</div>
        <div class="popup-prices">${priceRows}</div>
      `)
      .addTo(map.value);
  };

  clusterEnterHandler = () => { map.value.getCanvas().style.cursor = 'pointer'; };
  clusterLeaveHandler = () => { map.value.getCanvas().style.cursor = ''; };
  stationEnterHandler = () => { map.value.getCanvas().style.cursor = 'pointer'; };
  stationLeaveHandler = () => { map.value.getCanvas().style.cursor = ''; };

  map.value.on('click', 'clusters', clusterClickHandler);
  map.value.on('click', 'station-point', stationClickHandler);
  map.value.on('mouseenter', 'clusters', clusterEnterHandler);
  map.value.on('mouseleave', 'clusters', clusterLeaveHandler);
  map.value.on('mouseenter', 'station-point', stationEnterHandler);
  map.value.on('mouseleave', 'station-point', stationLeaveHandler);

  updateViewportColorScale();
}

function buildLocalities(data) {
  const index = new Map();
  for (const feature of data.features) {
    const address = feature.properties?.Address;
    if (!address) continue;
    const idx = address.lastIndexOf(',');
    if (idx < 0) continue;
    const locality = address.slice(idx + 1).trim();
    if (!locality) continue;
    const coords = feature.geometry?.coordinates;
    if (!coords) continue;
    if (!index.has(locality)) index.set(locality, []);
    index.get(locality).push(coords);
  }
  localities.value = Array.from(index.entries())
    .map(([name, coords]) => ({ name, coords }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function onSearchInput() {
  highlightIndex.value = -1;
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) {
    searchSuggestions.value = [];
    showSuggestions.value = false;
    return;
  }
  searchSuggestions.value = localities.value
    .filter((l) => l.name.toLowerCase().includes(q))
    .slice(0, 8);
  showSuggestions.value = true;
}

function selectLocality(locality) {
  searchQuery.value = locality.name;
  showSuggestions.value = false;
  highlightIndex.value = -1;
  if (!map.value) return;
  const { coords } = locality;
  if (coords.length === 1) {
    map.value.flyTo({ center: coords[0], zoom: 13 });
    return;
  }
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  map.value.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: 80, maxZoom: 14 }
  );
}

function highlightNext() {
  if (!showSuggestions.value) return;
  highlightIndex.value = Math.min(highlightIndex.value + 1, searchSuggestions.value.length - 1);
}

function highlightPrev() {
  if (!showSuggestions.value) return;
  highlightIndex.value = Math.max(highlightIndex.value - 1, -1);
}

function selectHighlighted() {
  const s = searchSuggestions.value[highlightIndex.value];
  if (s) selectLocality(s);
}

function onSearchBlur() {
  setTimeout(() => { showSuggestions.value = false; }, 150);
}

async function loadData() {
  let data;

  try {
    const remoteResponse = await fetch('https://regieessencequebec.ca/stations.geojson.gz');
    if (!remoteResponse.ok) {
      throw new Error(`HTTP ${remoteResponse.status}`);
    }

    data = await remoteResponse.json();
  } catch {
    console.warn('Failed to load live dataset, using sample data instead');
    data = generateSampleData();
  }

  geojsonData.value = data;
  buildLocalities(data);
  applyData(currentGasType.value);
  isLoading.value = false;
}

onMounted(async () => {
  await nextTick();

  const styleRes = await fetch('https://tiles.openfreemap.org/styles/dark');
  const style = await styleRes.json();
  style.glyphs = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

  map.value = new maplibregl.Map({
    container: mapElement.value,
    style,
    center: [-72.5, 47.0],
    zoom: 5.5,
    maxZoom: 18
  });

  map.value.on('styleimagemissing', (e) => {
    map.value.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });

  map.value.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  map.value.addControl(new maplibregl.GeolocateControl({
    positionOptions: {
      enableHighAccuracy: true
    },
    trackUserLocation: true
  }), 'bottom-right');
  map.value.on('load', loadData);
});

onBeforeUnmount(() => {
  detachMapEvents();
  if (map.value) {
    map.value.remove();
    map.value = null;
  }
});

watch(currentGasType, (gasType) => {
  applyData(gasType);
});
</script>
