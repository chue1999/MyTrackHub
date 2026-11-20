# MyTPlus Activity Tracking

Records who logs in to the MyTPlus app (phone number, first name, last name)
and what they do (screens opened, buttons tapped), and shows it on an admin
website.

```
MyTPlus app ──(x-api-key)──▶ api/  (Node + Express + Sequelize) ──▶ PostgreSQL
                                   ▲
admin/ (Nuxt 4 + Vuetify) ──(JWT)──┘
```

## 1. API

```bash
cd api
cp .env.example .env      # then fill in DB_PASSWORD, APP_API_KEY, JWT_SECRET, ADMIN_PASSWORD
npm install
npm run dev               # http://localhost:4000
```

On start the API creates the database (if missing) and all tables
automatically (Sequelize `sync`), and creates the first admin account from
`ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Create another admin or reset a password:

```bash
npm run seed:admin -- <username> <password> [display name]
```

### Tables

| Table       | What it holds |
|-------------|---------------|
| `app_users` | One row per phone number: name, device, app version, login count, first/last seen |
| `events`    | One row per action: `login`, `logout`, `screen_view`, `tap`, `action`, `error` + screen, properties, time, session, device |
| `admins`    | Admin website accounts (bcrypt-hashed passwords) |

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/track` | `x-api-key` | App sends a batch of up to 100 events |
| POST | `/api/admin/auth/login` | – | Admin login → JWT |
| GET | `/api/admin/auth/me` | JWT | Current admin |
| GET | `/api/admin/stats/overview?days=14` | JWT | Dashboard numbers, daily trend, top screens/taps |
| GET | `/api/admin/users?search=&page=&pageSize=&sort=` | JWT | Search users by phone or name |
| GET | `/api/admin/users/:id` | JWT | One user's profile and summary |
| GET | `/api/admin/events?userId=&type=&search=&from=&to=&page=` | JWT | Timeline / activity log |
| GET | `/health` | – | Health check |

Track payload:

```json
{
  "msisdn": "2055551234",
  "firstName": "Somsack",
  "lastName": "Phommachanh",
  "deviceId": "…", "platform": "android", "appVersion": "3.0.1", "deviceModel": "Pixel 7",
  "events": [
    { "type": "login", "name": "login", "sessionId": "…", "occurredAt": "2026-11-20T03:00:00Z" },
    { "type": "tap", "name": "Points", "screen": "ServicesPage", "properties": { "route": "/points" } }
  ]
}
```

### Privacy safeguards

- Property keys that look like secrets (`password`, `otp`, `pin`, `token`,
  `secret`, `cvv`, `card number`…) are dropped before saving.
- Events older than `RETENTION_DAYS` (default 180) are deleted daily.
- The admin website needs a login; the app key only allows *sending* events.
- Tell users about this tracking in the app's privacy policy.

## 2. Admin website

```bash
cd admin
cp .env.example .env      # NUXT_PUBLIC_API_BASE=http://localhost:4000
npm install
npm run dev               # http://localhost:3000
```

Pages: **Dashboard** (users, active today, logins, daily trend, most opened
screens and tapped buttons), **Users** (search by phone/name), **User detail**
(profile, devices, favourite screens, full activity timeline), **Activity log**
(all events with filters).

Production: `npm run build` → `node .output/server/index.mjs` (or
`npm run generate` and serve `.output/public` as static files). Add the
website's URL to `CORS_ORIGINS` in `api/.env`.

## 3. Flutter app

The tracker lives in `lib/services/tracking/activity_tracker.dart` in the
MyTPlus app. It is off unless built with:

```bash
flutter run \
  --dart-define=TRACKING_URL=http://<your-computer-ip>:4000 \
  --dart-define=TRACKING_KEY=<APP_API_KEY from api/.env>
```

(Use your computer's LAN IP, not `localhost`, when running on a phone; on
the Android emulator use `http://10.0.2.2:4000`.)

What it records automatically:

- **login**: after a successful login (`AuthBloc`)
- **name/surname**: when the customer info loads on the home screen (`RefillBloc`)
- **screen_view**: every page opened (navigator observer)
- **tap**: every service button (`ServiceButton`)
- **logout**: from Settings → Logout
- **app_opened**: when the app comes back to the foreground

Add your own anywhere:

```dart
ActivityTracker.instance.tap('Buy package', properties: {'package': code});
ActivityTracker.instance.action('topup_success', properties: {'amount': 10000});
```

Events are queued on the phone, sent every 15 s in batches, and kept until
sent, so nothing is lost when offline.
