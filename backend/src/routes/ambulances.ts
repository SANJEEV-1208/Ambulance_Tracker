import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

// GET /api/ambulances/nearby?lat=&lng=&radius=
// Returns on-duty ambulances within radius (meters, default 10km)
// No authentication required — open to all users
router.get('/nearby', async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = Math.min(parseFloat((req.query.radius as string) || '10000'), 50000); // cap at 50km

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT
         id,
         name,
         phone,
         vehicle_number,
         ST_Y(location::geometry)  AS latitude,
         ST_X(location::geometry)  AS longitude,
         ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
         )::integer                AS distance_meters,
         last_seen
       FROM drivers
       WHERE is_on_duty = true
         AND location IS NOT NULL
         AND ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         )
       ORDER BY distance_meters ASC
       LIMIT 50`,
      [lat, lng, radius]
    );

    res.json({ ambulances: result.rows });
  } catch (err) {
    console.error('Nearby ambulances error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
