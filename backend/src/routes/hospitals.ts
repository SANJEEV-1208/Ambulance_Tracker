import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/hospitals/nearby?lat=&lng=
// Uses Nominatim (OpenStreetMap) — free, no API key, works globally
router.get('/nearby', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    return;
  }

  // ~15km bounding box (0.135 degrees ≈ 15km)
  const offset = 0.135;
  const viewbox = `${lng - offset},${lat + offset},${lng + offset},${lat - offset}`;
  const url = `https://nominatim.openstreetmap.org/search?amenity=hospital&format=json&limit=50&viewbox=${viewbox}&bounded=1&addressdetails=0`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RESQUBE/1.0 (resume-project)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Nominatim error:', response.status);
      res.status(502).json({ error: `Map data source returned ${response.status}` });
      return;
    }

    const data = await response.json() as any[];
    const hospitals = data
      .filter((el) => el.lat && el.lon)
      .map((el) => ({
        id: String(el.place_id),
        name: el.name || el.display_name.split(',')[0] || 'Hospital',
        latitude: parseFloat(el.lat),
        longitude: parseFloat(el.lon),
      }));

    res.json({ hospitals });
  } catch (err) {
    console.error('Hospital fetch error:', err);
    res.status(500).json({ error: 'Network error while fetching hospital data' });
  }
});

export default router;
