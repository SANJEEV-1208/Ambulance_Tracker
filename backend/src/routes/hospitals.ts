import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/hospitals/nearby?lat=&lng=
// Proxies to Overpass API — avoids React Native fetch 406 issues
router.get('/nearby', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    return;
  }

  const query = `[out:json][timeout:25];(node["amenity"="hospital"](around:15000,${lat},${lng});way["amenity"="hospital"](around:15000,${lat},${lng}););out center;`;
  const body = `data=${encodeURIComponent(query)}`;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  let lastError = '';
  for (const mirror of mirrors) {
    try {
      const response = await fetch(mirror, { method: 'POST', headers, body });
      if (!response.ok) {
        lastError = `${mirror} → HTTP ${response.status}`;
        console.warn(lastError);
        continue;
      }
      const data = await response.json() as { elements: any[] };
      const hospitals = data.elements
        .map((el) => {
          const elLat = el.lat ?? el.center?.lat;
          const elLng = el.lon ?? el.center?.lon;
          if (!elLat || !elLng) return null;
          return { id: String(el.id), name: (el.tags?.name as string) || 'Hospital', latitude: elLat, longitude: elLng };
        })
        .filter(Boolean);
      res.json({ hospitals });
      return;
    } catch (err) {
      lastError = `${mirror} → ${err}`;
      console.warn(lastError);
    }
  }

  console.error('All Overpass mirrors failed:', lastError);
  res.status(502).json({ error: 'All map data sources unavailable' });
});

export default router;
