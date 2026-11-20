// Minimal environment so the config module loads without a real .env.
process.env.NODE_ENV = 'test';
process.env.APP_API_KEY ??= 'test-app-key-0123456789';
process.env.JWT_SECRET ??= 'test-jwt-secret-0123456789';
