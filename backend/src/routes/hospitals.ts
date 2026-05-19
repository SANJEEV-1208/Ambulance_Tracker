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

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      res.status(502).json({ error: `Overpass API error: ${response.status}` });
      return;
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
  } catch (err) {
    console.error('Hospital fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});

export default router;
