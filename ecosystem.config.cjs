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
    {
      name: 'mytrackhub-admin',
      cwd: '/var/www/MyTrackHub/admin',
      script: 'node_modules/nuxi/bin/nuxi.mjs',
      args: 'preview --port 3000 --host 127.0.0.1',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        NITRO_PORT: '3000',
        NITRO_HOST: '127.0.0.1',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
  ],
};
