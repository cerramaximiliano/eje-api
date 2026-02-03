module.exports = {
  apps: [
    {
      name: 'eje/api',
      script: 'src/server.js',
      cwd: '/var/www/eje-api',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 8000,
      exp_backoff_restart_delay: 2000,
      kill_timeout: 8000,
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
