import * as userService from '../services/user.service.js';
import { paging } from '../utils/query.js';

const MAX_PAGE_SIZE = 5000; // Reports export in pages of up to 5000 rows.

/** GET /users?search=&sort=&from=&to=&page=&pageSize= */
export async function list(req, res) {
  res.json(await userService.listUsers(req.query, paging(req.query, MAX_PAGE_SIZE)));
}

/** GET /users/:id */
export async function detail(req, res) {
  res.json(await userService.getUserDetail(req.params.id));
}

/** PATCH /users/:id */
export async function update(req, res) {
  res.json(await userService.updateUser(req.params.id, req.body));
}
