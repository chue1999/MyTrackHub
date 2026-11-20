import * as eventService from '../services/event.service.js';
import { paging } from '../utils/query.js';

const MAX_PAGE_SIZE = 5000; // Reports export in pages of up to 5000 rows.

/** GET /events?userId=&type=&apis=&success=&search=&from=&to=&page=&pageSize= */
export async function list(req, res) {
  res.json(await eventService.listEvents(req.query, paging(req.query, MAX_PAGE_SIZE)));
}

/** GET /events/:id */
export async function detail(req, res) {
  res.json(await eventService.getEvent(req.params.id));
}
