import { createTicket, liveClientCount, streamHandler } from '../services/live.service.js';

/** POST /stream/ticket — one-time ticket for opening the live stream. */
export function ticket(req, res) {
  res.json({ ticket: createTicket(req.me.id), viewers: liveClientCount() });
}

/** GET /stream?ticket= — Server-Sent Events (EventSource can't send headers). */
export const open = streamHandler;
