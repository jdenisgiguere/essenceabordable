import { describe, expect, it } from 'vitest';
import { buildPopupHTML, buildStationFilter, extractBrands, indexLocalities, rankBrandsByFrequency } from './stationsData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(address, coords, brand) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: { Address: address, brand },
  };
}

function makeCollection(...features) {
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// indexLocalities
// ---------------------------------------------------------------------------

describe('indexLocalities', () => {
  it('groups stations by the last address segment', () => {
    const data = makeCollection(
      makeFeature('123 rue Principale, Montréal', [-73.5, 45.5], 'Shell'),
      makeFeature('456 boul. des Laurentides, Montréal', [-73.6, 45.6], 'Esso'),
      makeFeature('789 rue du Lac, Laval', [-73.7, 45.7], 'Petro-Canada'),
    );

    const result = indexLocalities(data);

    expect(result).toHaveLength(2);
    const montreal = result.find((l) => l.name === 'Montréal');
    expect(montreal).toBeDefined();
    expect(montreal.coords).toHaveLength(2);
  });

  it('returns results sorted alphabetically (fr locale)', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Québec', [-71, 46], 'Shell'),
      makeFeature('2 rue B, Montréal', [-73, 45], 'Esso'),
      makeFeature('3 rue C, Laval', [-73.7, 45.7], 'Esso'),
    );

    const names = indexLocalities(data).map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('skips features with no address', () => {
    const data = makeCollection(
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-73, 45] }, properties: {} },
      makeFeature('1 rue A, Montréal', [-73, 45], 'Shell'),
    );

    expect(indexLocalities(data)).toHaveLength(1);
  });

  it('skips features with no coordinates', () => {
    const data = makeCollection(
      { type: 'Feature', geometry: null, properties: { Address: '1 rue A, Montréal' } },
      makeFeature('2 rue B, Laval', [-73.7, 45.7], 'Esso'),
    );

    expect(indexLocalities(data)).toHaveLength(1);
  });

  it('returns an empty array for an empty collection', () => {
    expect(indexLocalities(makeCollection())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractBrands
// ---------------------------------------------------------------------------

describe('extractBrands', () => {
  it('returns unique brand names', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Montréal', [-73, 45], 'Shell'),
      makeFeature('2 rue B, Montréal', [-73, 45], 'Shell'),
      makeFeature('3 rue C, Laval', [-73.7, 45.7], 'Esso'),
    );

    const brands = extractBrands(data);
    expect(brands).toHaveLength(2);
    expect(brands).toContain('Shell');
    expect(brands).toContain('Esso');
  });

  it('returns results sorted alphabetically (fr locale)', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Québec', [-71, 46], 'Shell'),
      makeFeature('2 rue B, Montréal', [-73, 45], 'Esso'),
      makeFeature('3 rue C, Laval', [-73.7, 45.7], 'Petro-Canada'),
    );

    const brands = extractBrands(data);
    expect(brands).toEqual([...brands].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('skips features with no brand', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Montréal', [-73, 45], null),
      makeFeature('2 rue B, Laval', [-73.7, 45.7], 'Esso'),
    );

    expect(extractBrands(data)).toEqual(['Esso']);
  });

  it('returns an empty array for an empty collection', () => {
    expect(extractBrands(makeCollection())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// rankBrandsByFrequency
// ---------------------------------------------------------------------------

describe('rankBrandsByFrequency', () => {
  it('ranks brands by station count, most frequent first', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Montréal', [-73, 45], 'Shell'),
      makeFeature('2 rue B, Montréal', [-73, 45], 'Shell'),
      makeFeature('3 rue C, Laval', [-73.7, 45.7], 'Esso'),
      makeFeature('4 rue D, Laval', [-73.7, 45.7], 'Esso'),
      makeFeature('5 rue E, Québec', [-71, 46], 'Esso'),
      makeFeature('6 rue F, Québec', [-71, 46], 'Petro-Canada'),
    );

    const brands = rankBrandsByFrequency(data);
    expect(brands[0]).toBe('Esso');       // 3 stations
    expect(brands[1]).toBe('Shell');      // 2 stations
    expect(brands[2]).toBe('Petro-Canada'); // 1 station
  });

  it('breaks ties alphabetically (fr locale)', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Montréal', [-73, 45], 'Shell'),
      makeFeature('2 rue B, Laval', [-73.7, 45.7], 'Esso'),
    );

    const brands = rankBrandsByFrequency(data);
    expect(brands).toEqual(['Esso', 'Shell']); // both count=1, alpha order
  });

  it('skips features with no brand', () => {
    const data = makeCollection(
      makeFeature('1 rue A, Montréal', [-73, 45], null),
      makeFeature('2 rue B, Laval', [-73.7, 45.7], 'Esso'),
    );

    expect(rankBrandsByFrequency(data)).toEqual(['Esso']);
  });

  it('returns an empty array for an empty collection', () => {
    expect(rankBrandsByFrequency(makeCollection())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildStationFilter
// ---------------------------------------------------------------------------

describe('buildStationFilter', () => {
  it('returns a no-cluster filter when brand is empty', () => {
    expect(buildStationFilter('')).toEqual(['!', ['has', 'point_count']]);
  });

  it('returns a no-cluster filter when brand is falsy', () => {
    expect(buildStationFilter(null)).toEqual(['!', ['has', 'point_count']]);
    expect(buildStationFilter(undefined)).toEqual(['!', ['has', 'point_count']]);
  });

  it('returns a combined filter when a brand is provided', () => {
    expect(buildStationFilter('Shell')).toEqual([
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'brand'], 'Shell'],
    ]);
  });

  it('always includes the no-cluster condition', () => {
    const filter = buildStationFilter('Esso');
    expect(filter[0]).toBe('all');
    expect(filter).toContainEqual(['!', ['has', 'point_count']]);
  });
});

// ---------------------------------------------------------------------------
// buildPopupHTML
// ---------------------------------------------------------------------------

describe('buildPopupHTML', () => {
  const prices = [
    { GasType: 'Régulier', Price: '165.3¢' },
    { GasType: 'Super', Price: '180.5¢' },
    { GasType: 'Diesel', Price: '185.2¢' },
  ];

  it('includes the station name, brand, and address', () => {
    const html = buildPopupHTML(
      { Name: 'Ultramar — Station 1', brand: 'Ultramar', Address: '1 rue A, Montréal' },
      prices,
      'Régulier',
    );

    expect(html).toContain('Ultramar — Station 1');
    expect(html).toContain('Ultramar');
    expect(html).toContain('1 rue A, Montréal');
  });

  it('highlights only the active gas type', () => {
    const html = buildPopupHTML({ Name: 'Station' }, prices, 'Super');
    const rows = html.match(/popup-price-row[^"]*"/g) ?? [];
    const highlighted = rows.filter((r) => r.includes('highlight'));

    expect(highlighted).toHaveLength(1);
  });

  it('falls back to "Station" when Name is missing', () => {
    const html = buildPopupHTML({}, [], 'Régulier');
    expect(html).toContain('Station');
  });

  it('renders one row per price entry', () => {
    const html = buildPopupHTML({ Name: 'Station' }, prices, 'Régulier');
    const rowCount = (html.match(/popup-price-row/g) ?? []).length;
    expect(rowCount).toBe(prices.length);
  });
});
