# MyTPlus Activity Tracking

Records who logs in to the MyTPlus mobile app (phone number, first name, last
name) and everything they do (screens, taps, every API call with its request,
response and result), and shows it live on an admin website.

```
MyTPlus app ──(x-api-key)──▶  api/   Node.js · Express · Sequelize ──▶ PostgreSQL
                                ▲  │
admin/  Nuxt 4 · Vuetify ─(JWT)─┘  └─(Server-Sent Events: live updates)─▶ admin/
```

| Folder   | What it is                  | Stack                                                       |
| -------- | --------------------------- | ----------------------------------------------------------- |
| `api/`   | REST API + real-time stream | Node.js ≥ 20, Express 4, Sequelize 6, PostgreSQL, zod, pino |
| `admin/` | Admin website (single-page) | Nuxt 4, Vue 3, Vuetify 3, TypeScript (strict)               |

---

## Quick start

```bash
# 1. API
cd api
cp .env.example .env        # fill in DB_PASSWORD, APP_API_KEY, JWT_SECRET, ADMIN_PASSWORD
npm install
npm run dev                 # http://localhost:4000

# 2. Admin website (second terminal)
cd admin
cp .env.example .env        # leave NUXT_PUBLIC_API_BASE empty (dev proxy → :4000)
npm install
npm run dev                 # http://localhost:3000
```

On start the API creates the database (if missing) and all tables
(Sequelize `sync`), and the first admin account from `ADMIN_USERNAME` /
`ADMIN_PASSWORD`. Create another admin or reset a password:

```bash
cd api && npm run seed:admin -- <username> <password> [display name]
```

---

## API (`api/`)

### Structure

Layered architecture: each request goes **route → middleware → controller →
service → model**. Controllers only translate HTTP; business rules and SQL
live in services.

```
api/
├── src/
│   ├── server.js            entry point: DB → first admin → jobs → HTTP, graceful shutdown
│   ├── app.js               Express app factory (security headers, logging, routes, errors)
│   ├── config/              environment variables, validated with zod at start-up
│   ├── db/                  Sequelize connection, database auto-creation
│   ├── models/              one file per table + associations (index.js)
│   ├── routes/              URL → controller; admin/ holds one file per resource
│   ├── middlewares/         auth (app key, JWT, roles), validation, rate limits, errors
│   ├── validators/          zod schemas for request bodies
│   ├── controllers/         thin HTTP handlers
│   ├── services/            business logic and SQL (stats, tracking, retention, live stream…)
│   ├── jobs/                background jobs (hourly log clean-up)
│   ├── utils/               logger, HttpError, query helpers, JWT, data sanitising
│   └── scripts/             CLI tools (create-admin)
├── tests/                   unit tests (no database)
│   └── integration/         end-to-end tests against a real PostgreSQL test database
└── eslint.config.js · .prettierrc.json · .env.example
```

### Scripts

| Command                     | What it does                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`               | Start with auto-restart on file changes                                              |
| `npm start`                 | Start in production mode (JSON logs)                                                 |
| `npm test`                  | Unit tests                                                                           |
| `npm run test:integration`  | API tests on a real database (**wipes** `DB_NAME`, default `mytplus_tracking_test`) |
| `npm run lint` / `lint:fix` | ESLint                                                                               |
| `npm run format`            | Prettier                                                                             |
| `npm run check`             | Lint + format check + unit tests (run before committing)                             |

### Endpoints (v1)

Admin endpoints need `Authorization: Bearer <token>` from the login. Errors
always look like `{ "message": "…", "code": "NOT_FOUND" }` (validation errors
add `issues`).

| Method                      | Path                                   | Who               | Purpose                                                                     |
| --------------------------- | -------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| GET                         | `/health`                              | –                 | Health check (database included)                                            |
| POST                        | `/api/v1/track`                        | app (`x-api-key`) | A batch of up to 100 events                                                 |
| GET                         | `/api/v1/public/branding`              | –                 | Website name & logo                                                         |
| POST                        | `/api/v1/admin/auth/login`             | –                 | Log in → JWT                                                                |
| GET                         | `/api/v1/admin/auth/me`                | any admin         | Current account                                                             |
| POST                        | `/api/v1/admin/auth/password`          | any admin         | Change own password                                                         |
| GET                         | `/api/v1/admin/stats/overview`         | any admin         | Dashboard                                                                   |
| GET                         | `/api/v1/admin/stats/packages`         | any admin         | Packages sold, revenue, data left                                           |
| GET                         | `/api/v1/admin/stats/features`         | any admin         | Usage of every app feature                                                  |
| GET                         | `/api/v1/admin/users`                  | any admin         | Search users (`search`, `sort`, `from`, `to`, `page`, `pageSize`)           |
| GET / PATCH                 | `/api/v1/admin/users/:id`              | any / admin       | One user / edit name & note                                                 |
| GET                         | `/api/v1/admin/events`                 | any admin         | Activity log (`userId`, `type`, `apis`, `success`, `search`, `from`, `to`…) |
| GET                         | `/api/v1/admin/events/:id`             | any admin         | One action with full details                                                |
| GET / POST / PATCH / DELETE | `/api/v1/admin/accounts[/:id]`         | admin             | Admin accounts                                                              |
| GET / PUT                   | `/api/v1/admin/settings/retention`     | any / admin       | Auto delete old logs                                                        |
| POST                        | `/api/v1/admin/settings/retention/run` | admin             | Delete old logs now                                                         |
| GET / PUT                   | `/api/v1/admin/settings/branding`      | any / admin       | Website name & logo                                                         |
| POST                        | `/api/v1/admin/stream/ticket`          | any admin         | One-time ticket for the live stream                                         |
| GET                         | `/api/v1/admin/stream?ticket=`         | ticket            | Live updates (Server-Sent Events)                                           |

`/api/admin/*` and `/api/public/*` still work as aliases for older clients.

Track payload:

```json
{
  "msisdn": "2055551234",
  "firstName": "Somsack",
  "lastName": "Phommachanh",
  "deviceId": "…",
  "platform": "android",
  "appVersion": "3.0.1",
  "deviceModel": "Pixel 7",
  "events": [
    { "type": "login", "name": "login", "sessionId": "…", "occurredAt": "2026-11-20T03:00:00Z" },
    {
      "type": "api",
      "name": "POST /tplus/TransferBalance",
      "success": true,
      "result": "Success",
      "properties": { "request": { "body": { "Receiver": "2077778888", "TransferAmount": "5000" } } }
    }
  ]
}
```

### Tables

| Table       | What it holds                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `app_users` | One row per phone number: name, device, app version, login count, first/last seen, active packages |
| `events`    | One row per action: `login`, `logout`, `screen_view`, `tap`, `action`, `api`, `error`               |
| `admins`    | Admin website accounts (bcrypt-hashed passwords, role `admin` or `viewer`)                          |
| `settings`  | Settings changed on the website (log retention, name & logo)                                        |

### Security & privacy

- Property keys that look like secrets (`password`, `otp`, `pin`, `token`,
  `secret`, `cvv`, `card number`…) are dropped before saving.
- Old logs are deleted automatically (default: older than 4 months; change
  it on **Settings → Auto delete old logs**).
- Helmet security headers, CORS limited to `CORS_ORIGINS`, rate limits on
  login and tracking, constant-time API key check, secrets redacted from logs.
- Disabled admin accounts lose access immediately.
- Tell users about this tracking in the app's privacy policy.

---

## Admin website (`admin/`)

### Structure

```
admin/
├── app/
│   ├── pages/            one file per URL (Nuxt file-based routing)
│   ├── layouts/          the sidebar + top bar shell
│   ├── components/
│   │   ├── charts/       Pie3D, ColumnChart, HBarChart, SplitBar
│   │   ├── data/         DataView (JSON → tables), EventTable
│   │   ├── common/       StatCard, DateRange, BrandMark
│   │   └── layout/       GlobalSearch, ChangePasswordDialog
│   ├── composables/      useApi, useAuth, useLive (real-time), useBranding
│   ├── types/            API data types (api.ts)
│   ├── utils/            formatting, app-feature catalogue, reports, Excel export, errors
│   ├── middleware/       login guard
│   ├── plugins/          Vuetify theme, branding (browser tab title & icon)
│   └── assets/           global CSS (fonts, chart colours)
└── nuxt.config.ts · eslint.config.mjs · .prettierrc.json · tsconfig.json
```

Components keep their plain names in templates (`<Pie3D>`, `<DataView>`)
whatever folder they are in.

### Scripts

| Command                   | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Development server on http://localhost:3000        |
| `npm run build`           | Production build (`node .output/server/index.mjs`) |
| `npm run generate`        | Static build (serve `.output/public`)              |
| `npm run typecheck`       | TypeScript check (strict)                          |
| `npm run lint` / `format` | ESLint / Prettier                                  |
| `npm run check`           | Lint + format check + typecheck                    |

Production: `npm run generate` and let nginx serve `.output/public` and pass
`/api/` to the API on the same address — see `deploy/nginx-mytrackhub.conf`.
No `NUXT_PUBLIC_API_BASE` or CORS needed. (Only when the API is on another
site: set `NUXT_PUBLIC_API_BASE` to it and add the website to `CORS_ORIGINS`.)

---

## Flutter app

The tracker lives in `lib/services/tracking/` of the MyTPlus app
(`activity_tracker.dart`, `tracked_dio.dart`, `tracking_config.dart`).

- Debug builds find the API automatically: Android emulator → `10.0.2.2`,
  iOS simulator → `localhost`, real phone over USB → `adb reverse` (set up by
  the VS Code launch task), otherwise the computer's Wi-Fi IP.
- Release builds send to `TrackingConfig.productionUrl` (tracking is off
  while it is empty).
- Every `Dio` client is created with `trackedDio()`, so every API call is
  recorded with its request, response, duration and success/failure.
- Events are queued on the phone and sent in batches, so nothing is lost
  while offline.
