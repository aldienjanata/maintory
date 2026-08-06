const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('temp_raw.geojson', 'utf8'));

function getAllCoords(geometry) {
  if (!geometry) return [];
  const type = geometry.type;
  const flat = [];
  function flattenRings(rings) {
    for (const ring of rings) {
      if (Array.isArray(ring[0])) { for (const c of ring) flat.push(c); }
      else flat.push(ring);
    }
  }
  if (type === 'Polygon') flattenRings(geometry.coordinates);
  else if (type === 'MultiPolygon') for (const poly of geometry.coordinates) flattenRings(poly);
  return flat;
}

function computeFeatureBbox(feature) {
  const coords = getAllCoords(feature.geometry);
  if (!coords.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [
    Number(minX.toFixed(5)), 
    Number(minY.toFixed(5)), 
    Number(maxX.toFixed(5)), 
    Number(maxY.toFixed(5))
  ];
}

const slim = {
  type: 'FeatureCollection',
  features: raw.features.map(f => {
    return {
      type: 'Feature',
      bbox: computeFeatureBbox(f),
      geometry: f.geometry,
      properties: {
        prov: f.properties.ADM1_EN || '',
        kab:  f.properties.ADM2_EN || '',
        kec:  f.properties.ADM3_EN || '',
        desa: f.properties.ADM4_EN || '',
      }
    };
  })
};

fs.writeFileSync('src/assets/desa_jateng_pip.json', JSON.stringify(slim));
console.log('Done. Features:', slim.features.length);
console.log('Sample:', slim.features[0].properties);
