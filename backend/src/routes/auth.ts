import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { name, email, phone, password, vehicle_number } = req.body;

  if (!name || !email || !phone || !password || !vehicle_number) {
    res.status(400).json({ error: 'All fields are required: name, email, phone, password, vehicle_number' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM drivers WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO drivers (name, email, phone, password_hash, vehicle_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, vehicle_number, is_on_duty, created_at`,
      [name.trim(), email.toLowerCase().trim(), phone.trim(), password_hash, vehicle_number.trim().toUpperCase()]
    );

    const driver = result.rows[0];
    const token = jwt.sign({ driverId: driver.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });

    res.status(201).json({ token, driver });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, vehicle_number, is_on_duty, password_hash FROM drivers WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const driver = result.rows[0];
    const valid = await bcrypt.compare(password, driver.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign({ driverId: driver.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    const { password_hash, ...driverData } = driver;

    res.json({ token, driver: driverData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me  (protected)
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, vehicle_number, is_on_duty, created_at FROM drivers WHERE id = $1',
      [req.driverId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Driver not found' });
      return;
    }

    res.json({ driver: result.rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
