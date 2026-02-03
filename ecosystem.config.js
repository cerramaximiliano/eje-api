module.exports = {
  apps: [
    {
      name: 'eje/api',
      script: 'src/server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_development: {
        NODE_ENV: 'development',
        PORT: 3004
      },
      env_local: {
        NODE_ENV: 'local',
        PORT: 8084
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
