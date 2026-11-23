// pm2 on the server: only the API runs as a process.
// The admin website is static files (`npm run generate` → admin/.output/public)
// served by nginx, see deploy/nginx-mytrackhub.conf.
//
//   pm2 start ecosystem.config.cjs && pm2 save
//
// The API reads api/.env.production (NODE_ENV=production): SQL Server settings etc.
module.exports = {
  apps: [
    {
      name: 'mytrackhub-api',
      cwd: '/var/www/MyTrackHub/api',
      script: 'src/server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
  ],
};
