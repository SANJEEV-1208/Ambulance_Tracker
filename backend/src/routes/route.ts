import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/route?fromLat=&fromLng=&toLat=&toLng=
// Proxies to OSRM public API — free, no key, returns driving route geometry
router.get('/', async (req: Request, res: Response) => {
  const fromLat = parseFloat(req.query.fromLat as string);
  const fromLng = parseFloat(req.query.fromLng as string);
  const toLat   = parseFloat(req.query.toLat   as string);
  const toLng   = parseFloat(req.query.toLng   as string);

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng are required' });
    return;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AmbulanceTracker/1.0' },
    });
    if (!response.ok) throw new Error(`OSRM ${response.status}`);

    const data = await response.json() as any;
    if (!data.routes?.length) {
      res.status(404).json({ error: 'No route found' });
      return;
    }

    res.json({
      coordinates: data.routes[0].geometry.coordinates,
      distance_metres: Math.round(data.routes[0].distance),
      duration_seconds: Math.round(data.routes[0].duration),
    });
  } catch (err) {
    console.error('Route fetch error:', err);
    res.status(502).json({ error: 'Could not fetch route' });
  }
});

export default router;
