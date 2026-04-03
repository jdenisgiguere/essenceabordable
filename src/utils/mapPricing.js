export const COLOR_STOPS = [
  [130, '#22c55e'],
  [155, '#84cc16'],
  [170, '#eab308'],
  [185, '#f97316'],
  [200, '#ef4444']
];

export const GAS_TYPES = ['Régulier', 'Super', 'Diesel'];

export function buildColorExpr(property, min, max) {
  if (min === max) {
    return [
      'case',
      ['==', ['get', property], min], '#eab308',
      '#52525b'
    ];
  }

  const mid = min + (max - min) / 2;

  return [
    'interpolate', ['linear'], ['get', property],
    min, '#22c55e',
    mid, '#eab308',
    max, '#ef4444'
  ];
}

export function preprocessData(geojson, gasType) {
  return {
    type: 'FeatureCollection',
    features: geojson.features
      .filter((feature) => feature.geometry && feature.geometry.coordinates)
      .map((feature) => {
        const prices = feature.properties.Prices || [];
        const match = prices.find((price) => price.GasType === gasType && price.IsAvailable);
        const normalizedPrice = match
          ? parseFloat(String(match.Price).replace(/[^0-9.]/g, ''))
          : null;

        return {
          type: 'Feature',
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            _price: normalizedPrice,
            Prices: JSON.stringify(prices)
          }
        };
      })
  };
}
