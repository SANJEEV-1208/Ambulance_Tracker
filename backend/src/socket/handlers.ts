import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

interface DriverSocket extends Socket {
  driverId?: string;
}

const acceptedSos = new Map<string, boolean>();

export function setupSocketHandlers(io: Server): void {
  // Middleware: authenticate drivers, allow users through unauthenticated
  io.use((socket: DriverSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      // Unauthenticated = user (read-only map watcher)
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { driverId: string };
      socket.driverId = decoded.driverId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: DriverSocket) => {
    const role = socket.driverId ? `driver:${socket.driverId}` : 'user';
    console.log(`[socket] connected  id=${socket.id}  role=${role}`);

    // ── DRIVER EVENTS ──────────────────────────────────────────────────────

    // Driver sends live location update every ~5 seconds
    socket.on('driver:update_location', async (data: { latitude: number; longitude: number }) => {
      if (!socket.driverId) return;

      const { latitude, longitude } = data;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return;

      try {
        await pool.query(
          `UPDATE drivers
           SET location  = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
               last_seen = NOW()
           WHERE id = $3`,
          [latitude, longitude, socket.driverId]
        );

        // Broadcast new position to all watching clients
        socket.broadcast.emit('ambulance:location_updated', {
          driverId: socket.driverId,
          latitude,
          longitude,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[socket] update_location error:', err);
      }
    });

    // Driver goes on duty
    socket.on('driver:on_duty', async () => {
      if (!socket.driverId) return;

      try {
        const result = await pool.query(
          `UPDATE drivers
           SET is_on_duty = true
           WHERE id = $1
           RETURNING id, name, phone, vehicle_number`,
          [socket.driverId]
        );

        if (result.rows[0]) {
          socket.broadcast.emit('ambulance:on_duty', {
            driverId: socket.driverId,
            ...result.rows[0],
          });
        }
      } catch (err) {
        console.error('[socket] on_duty error:', err);
      }
    });

    // Driver goes off duty (manual)
    socket.on('driver:off_duty', async () => {
      if (!socket.driverId) return;
      await goOffDuty(socket.driverId, io);
    });

    // ── USER EVENTS ───────────────────────────────────────────────────────────

    // User sends SOS → broadcast to all on-duty drivers
    socket.on('user:sos', (data: { latitude: number; longitude: number }) => {
      const { latitude, longitude } = data;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
      const sosId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      console.log(`[socket] SOS from ${socket.id} at ${latitude},${longitude} id=${sosId}`);
      socket.broadcast.emit('sos:alert', { sosId, latitude, longitude, timestamp: new Date().toISOString() });
    });

    // Driver accepts SOS — only the first acceptance wins
    socket.on('sos:accept', async (data: { sosId: string }) => {
      if (!socket.driverId || !data.sosId) return;
      if (acceptedSos.has(data.sosId)) return;
      acceptedSos.set(data.sosId, true);
      setTimeout(() => acceptedSos.delete(data.sosId), 600000);
      try {
        const result = await pool.query(
          'SELECT name, phone, vehicle_number FROM drivers WHERE id = $1',
          [socket.driverId]
        );
        if (result.rows[0]) {
          io.emit('sos:accepted', {
            sosId: data.sosId,
            driverId: socket.driverId,
            driver: result.rows[0],
          });
        }
      } catch (err) {
        console.error('[socket] sos:accept error:', err);
      }
    });

    // Driver disconnects (app closed / network lost) → auto off-duty
    socket.on('disconnect', async () => {
      console.log(`[socket] disconnected id=${socket.id}  role=${role}`);
      if (socket.driverId) {
        await goOffDuty(socket.driverId, io);
      }
    });
  });
}

async function goOffDuty(driverId: string, io: Server): Promise<void> {
  try {
    await pool.query(
      'UPDATE drivers SET is_on_duty = false, location = NULL WHERE id = $1',
      [driverId]
    );
    io.emit('ambulance:off_duty', { driverId });
  } catch (err) {
    console.error('[socket] goOffDuty error:', err);
  }
}
