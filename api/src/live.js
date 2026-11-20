import crypto from 'node:crypto';

/**
 * Real-time push to the admin website with Server-Sent Events.
 *
 * The browser's EventSource can't send an Authorization header, so the site
 * first asks for a short-lived one-time ticket (with its JWT) and opens the
 * stream with ?ticket=… .
 *
 * Note: clients are kept in memory, so this works for one API process. If you
 * run several API instances behind a load balancer, put Redis pub/sub between
 * them.
 */

const clients = new Set();
const tickets = new Map(); // ticket -> { adminId, expires }
const TICKET_TTL_MS = 60_000;

export function createTicket(adminId) {
  const ticket = crypto.randomBytes(24).toString('hex');
  tickets.set(ticket, { adminId, expires: Date.now() + TICKET_TTL_MS });
  return ticket;
}

function useTicket(ticket) {
  const entry = ticket && tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket); // one-time
  return entry.expires > Date.now() ? entry : null;
}

setInterval(() => {
  const now = Date.now();
  for (const [t, e] of tickets) if (e.expires <= now) tickets.delete(t);
}, TICKET_TTL_MS).unref();

/** GET /api/admin/stream?ticket=… */
export function streamHandler(req, res) {
  const entry = useTicket(String(req.query.ticket || ''));
  if (!entry) return res.status(401).json({ message: 'Invalid or expired stream ticket' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let nginx buffer the stream
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  send(res, 'hello', { clients: clients.size + 1, at: new Date().toISOString() });

  const client = { res, adminId: entry.adminId };
  clients.add(client);

  // Keeps proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Pushes to every connected admin. */
export function broadcast(event, data) {
  for (const c of clients) {
    try {
      send(c.res, event, data);
    } catch {
      clients.delete(c);
    }
  }
}

export const liveClientCount = () => clients.size;
