const path = require('path');

module.exports = {
  apps: [
    {
      name: 'mall-backend',
      script: 'src/app.js',
      cwd: path.join(__dirname, 'wx-backend'),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_file: '/var/log/mall/mall-backend.log',
      out_file: '/var/log/mall/mall-backend-out.log',
      error_file: '/var/log/mall/mall-backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'mall-admin',
      script: 'server.js',
      cwd: path.join(__dirname, 'admin-server'),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        ADMIN_PORT: 3001
      },
      log_file: '/var/log/mall/mall-admin.log',
      out_file: '/var/log/mall/mall-admin-out.log',
      error_file: '/var/log/mall/mall-admin-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '512M',
      node_args: '--max-old-space-size=512',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
