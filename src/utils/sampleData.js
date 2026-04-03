export function generateSampleData() {
  const regions = [
    { name: 'Montréal', center: [-73.57, 45.5], radius: 0.3, count: 180, priceBase: 165 },
    { name: 'Québec', center: [-71.21, 46.81], radius: 0.2, count: 80, priceBase: 170 },
    { name: 'Gatineau', center: [-75.7, 45.47], radius: 0.15, count: 50, priceBase: 168 },
    { name: 'Sherbrooke', center: [-71.89, 45.4], radius: 0.15, count: 40, priceBase: 172 },
    { name: 'Trois-Rivières', center: [-72.55, 46.35], radius: 0.1, count: 30, priceBase: 171 },
    { name: 'Saguenay', center: [-71.07, 48.43], radius: 0.2, count: 35, priceBase: 176 },
    { name: 'Rimouski', center: [-68.52, 48.45], radius: 0.15, count: 20, priceBase: 180 },
    { name: 'Abitibi', center: [-79.0, 48.1], radius: 0.4, count: 25, priceBase: 185 },
    { name: 'Côte-Nord', center: [-67.5, 49.2], radius: 0.5, count: 15, priceBase: 190 },
    { name: 'Laurentides', center: [-74.0, 46.1], radius: 0.3, count: 50, priceBase: 169 },
    { name: 'Lanaudière', center: [-73.5, 46.2], radius: 0.2, count: 35, priceBase: 170 },
    { name: 'Estrie', center: [-71.5, 45.3], radius: 0.25, count: 30, priceBase: 173 },
    { name: 'Bas-Saint-Laurent', center: [-69.0, 47.8], radius: 0.4, count: 25, priceBase: 178 },
    { name: 'Beauce', center: [-70.8, 46.1], radius: 0.2, count: 25, priceBase: 174 },
    { name: 'Gaspésie', center: [-65.5, 48.8], radius: 0.5, count: 20, priceBase: 192 }
  ];

  const brands = ['Ultramar', 'Petro-Canada', 'Shell', 'Esso', 'Couche-Tard', 'Canadian Tire', 'Costco', 'Harnois', 'Sonic', 'Aucun'];
  const streetNames = ['boul. des Laurentides', 'rue Principale', 'route 138', 'ch. Sainte-Foy', 'av. du Pont', 'boul. Saint-Joseph', 'rue King', 'route 117', 'boul. Taschereau', 'rue Sherbrooke'];

  const features = [];
  let id = 1;

  for (const region of regions) {
    for (let index = 0; index < region.count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * region.radius;
      const lng = region.center[0] + Math.cos(angle) * dist;
      const lat = region.center[1] + Math.sin(angle) * dist * 0.7;

      const regPrice = region.priceBase + (Math.random() - 0.5) * 30;
      const superPrice = regPrice + 15 + Math.random() * 15;
      const dieselPrice = regPrice + 20 + Math.random() * 20;

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          Name: `${brands[Math.floor(Math.random() * brands.length)]} — Station ${id}`,
          brand: brands[Math.floor(Math.random() * brands.length)],
          Status: 'En opération',
          Address: `${Math.floor(Math.random() * 9000) + 100} ${streetNames[Math.floor(Math.random() * streetNames.length)]}`,
          Region: region.name,
          Prices: [
            { GasType: 'Régulier', Price: `${regPrice.toFixed(1)}¢`, IsAvailable: true },
            { GasType: 'Super', Price: `${superPrice.toFixed(1)}¢`, IsAvailable: Math.random() > 0.1 },
            { GasType: 'Diesel', Price: `${dieselPrice.toFixed(1)}¢`, IsAvailable: Math.random() > 0.05 }
          ]
        }
      });

      id += 1;
    }
  }

  return { type: 'FeatureCollection', features };
}
