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
        <div v-if="brands.length" class="geocoder brand-filter">
          <input
            v-model="brandQuery"
            type="text"
            placeholder="Filtrer par marque…"
            autocomplete="off"
            @input="onBrandInput"
            @blur="onBrandBlur"
            @keydown.down.prevent="brandHighlightNext"
            @keydown.up.prevent="brandHighlightPrev"
            @keydown.enter.prevent="selectBrandHighlighted"
            @keydown.escape="showBrandSuggestions = false"
          />
          <button v-if="selectedBrand" class="geocoder-clear" @mousedown.prevent="clearBrand" title="Effacer le filtre">×</button>
          <ul v-if="showBrandSuggestions && brandSuggestions.length" class="geocoder-suggestions">
            <li
              v-for="(b, i) in brandSuggestions"
              :key="b"
              :class="{ active: i === brandHighlightIndex }"
              @mousedown.prevent="selectBrand(b)"
            >{{ b }}</li>
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

const brands = shallowRef([]);
const selectedBrand = ref('');
const brandQuery = ref('');
const brandSuggestions = ref([]);
const showBrandSuggestions = ref(false);
const brandHighlightIndex = ref(-1);

let moveEndHandler = null;
let zoomEndHandler = null;
let clusterClickHandler = null;
let stationClickHandler = null;
let clusterEnterHandler = null;
let clusterLeaveHandler = null;
let stationEnterHandler = null;
let stationLeaveHandler = null;

function updateViewportCount() {
  if (!map.value || !map.value.getLayer('station-point')) return;

  const clusterFeatures = map.value.queryRenderedFeatures({ layers: ['clusters'] });
  const pointFeatures = map.value.queryRenderedFeatures({ layers: ['station-point'] });

  const total =
    clusterFeatures.reduce((sum, f) => sum + (f.properties?.point_count ?? 0), 0) +
    pointFeatures.length;

  stationCount.value = total.toLocaleString('fr-CA');
}

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

  detachMapEvents();

  if (map.value.getLayer('cluster-label')) map.value.removeLayer('cluster-label');
  if (map.value.getLayer('clusters')) map.value.removeLayer('clusters');
  if (map.value.getLayer('station-label')) map.value.removeLayer('station-label');
  if (map.value.getLayer('station-point')) map.value.removeLayer('station-point');
  if (map.value.getSource('stations')) map.value.removeSource('stations');

  map.value.addSource('stations', {
    type: 'geojson',
    data: processed,
    // cluster: true,
    // clusterMaxZoom: 20,
    // clusterRadius: 2,
    /*clusterProperties: {
      min_price: ['min', ['get', '_price']]
    }*/
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
      'circle-radius': 2,
      // 'circle-stroke-width': 1,
      //'circle-stroke-color': 'rgba(0,0,0,0.3)'
    }
  });

  map.value.addLayer({
    id: 'cluster-label',
    type: 'symbol',
    source: 'stations',
    minzoom: 10,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['concat', ['get', 'min_price'], '¢'],
      'text-size': 12,
      'text-allow-overlap': true,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],

    },
    paint: {
      'text-color': '#18181b',
      'text-halo-color': 'rgba(255,255,255,0.85)',
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
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 1.5,   // zoom 5  → rayon 1.5px
        10, 3,    // zoom 10 → rayon 3px
        14, 6,    // zoom 14 → rayon 6px
        18, 12    // zoom 18 → rayon 12px
      ],
      // 'circle-stroke-width': 1,
      // 'circle-stroke-color': 'rgba(0,0,0,0.4)',
      'circle-opacity': 0.9
    }
  });

  map.value.addLayer({
    id: 'station-label',
    type: 'symbol',
    source: 'stations',
    filter: ['!', ['has', 'point_count']],
    minzoom: 10,
    layout: {
      'text-field': [
        'concat',
        ['number-format', ['get', '_price'], { 'min-fraction-digits': 1, 'max-fraction-digits': 1 }],
        '¢'
      ],
      'text-size': 14,
      'text-offset': [0, 1.6],
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-allow-overlap': true
    },
    paint: {
      'text-color': '#18181b',
      'text-halo-color': 'rgba(255,255,255,0.85)',
      'text-halo-width': 1
    }
  });

  moveEndHandler = () => { updateViewportColorScale(); updateViewportCount(); };
  zoomEndHandler = () => { updateViewportColorScale(); updateViewportCount(); };
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
  map.value.once('idle', updateViewportCount);
  applyBrandFilter();
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

function buildBrands(data) {
  const set = new Set();
  for (const feature of data.features) {
    const brand = feature.properties?.brand;
    if (brand) set.add(brand);
  }
  brands.value = Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

function applyBrandFilter() {
  if (!map.value) return;
  const noCluster = ['!', ['has', 'point_count']];
  const filter = selectedBrand.value
    ? ['all', noCluster, ['==', ['get', 'brand'], selectedBrand.value]]
    : noCluster;
  if (map.value.getLayer('station-point')) map.value.setFilter('station-point', filter);
  if (map.value.getLayer('station-label')) map.value.setFilter('station-label', filter);
  map.value.once('idle', updateViewportCount);
  updateViewportColorScale();
}

function onBrandInput() {
  brandHighlightIndex.value = -1;
  const q = brandQuery.value.trim().toLowerCase();
  if (!q) {
    brandSuggestions.value = [];
    showBrandSuggestions.value = false;
    return;
  }
  brandSuggestions.value = brands.value.filter((b) => b.toLowerCase().includes(q)).slice(0, 8);
  showBrandSuggestions.value = true;
}

function selectBrand(brand) {
  selectedBrand.value = brand;
  brandQuery.value = brand;
  showBrandSuggestions.value = false;
  brandHighlightIndex.value = -1;
  applyBrandFilter();
}

function clearBrand() {
  selectedBrand.value = '';
  brandQuery.value = '';
  showBrandSuggestions.value = false;
  brandHighlightIndex.value = -1;
  applyBrandFilter();
}

function brandHighlightNext() {
  if (!showBrandSuggestions.value) return;
  brandHighlightIndex.value = Math.min(brandHighlightIndex.value + 1, brandSuggestions.value.length - 1);
}

function brandHighlightPrev() {
  if (!showBrandSuggestions.value) return;
  brandHighlightIndex.value = Math.max(brandHighlightIndex.value - 1, -1);
}

function selectBrandHighlighted() {
  const b = brandSuggestions.value[brandHighlightIndex.value];
  if (b) selectBrand(b);
}

function onBrandBlur() {
  setTimeout(() => { showBrandSuggestions.value = false; }, 150);
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
  buildBrands(data);
  applyData(currentGasType.value);
  isLoading.value = false;
}

onMounted(async () => {
  await nextTick();

  const styleRes = await fetch('https://tiles.openfreemap.org/styles/positron');
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
