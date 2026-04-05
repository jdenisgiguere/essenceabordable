/**
 * Pure data-transformation helpers for station GeoJSON.
 * No Vue refs, no MapLibre instance — safe to unit-test in isolation.
 */

/**
 * Build a sorted locality index from a GeoJSON FeatureCollection.
 * @param {object} data  GeoJSON FeatureCollection
 * @returns {{ name: string, coords: number[][] }[]}
 */
export function indexLocalities(data) {
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
  return Array.from(index.entries())
    .map(([name, coords]) => ({ name, coords }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Extract a sorted list of unique brand names from a GeoJSON FeatureCollection.
 * @param {object} data  GeoJSON FeatureCollection
 * @returns {string[]}
 */
export function extractBrands(data) {
  const set = new Set();
  for (const feature of data.features) {
    const brand = feature.properties?.brand;
    if (brand) set.add(brand);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

/**
 * Return brand names ranked by station count (descending).
 * Ties are broken alphabetically (fr locale).
 * @param {object} data  GeoJSON FeatureCollection
 * @returns {string[]}
 */
export function rankBrandsByFrequency(data) {
  const counts = new Map();
  for (const feature of data.features) {
    const brand = feature.properties?.brand;
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b, 'fr'))
    .map(([brand]) => brand);
}

/**
 * Build a MapLibre filter expression that excludes clusters and optionally
 * restricts to a single brand.
 * @param {string} brand  Brand name, or empty string / falsy for no brand filter
 * @returns {unknown[]}   MapLibre filter expression
 */
export function buildStationFilter(brand) {
  const noCluster = ['!', ['has', 'point_count']];
  if (!brand) return noCluster;
  return ['all', noCluster, ['==', ['get', 'brand'], brand]];
}

/**
 * Render the inner HTML for a station popup.
 * @param {{ Name?: string, brand?: string, Address?: string }} props
 * @param {{ GasType: string, Price: string }[]} prices
 * @param {string} activeGasType  Currently selected gas type (highlighted in the popup)
 * @returns {string}  HTML string
 */
export function buildPopupHTML(props, prices, activeGasType) {
  const priceRows = prices.map((price) => {
    const isHighlight = price.GasType === activeGasType;
    return `<div class="popup-price-row ${isHighlight ? 'highlight' : ''}">
      <span class="popup-gas-type">${price.GasType}</span>
      <span class="popup-price-val">${price.Price}</span>
    </div>`;
  }).join('');

  return `
    <div class="popup-name">${props.Name || 'Station'}</div>
    <div class="popup-brand">${props.brand || ''}</div>
    <div class="popup-address">${props.Address || ''}</div>
    <div class="popup-prices">${priceRows}</div>
  `;
}
