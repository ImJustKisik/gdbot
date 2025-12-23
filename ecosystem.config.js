module.exports = {
  apps : [{
    name: "gdbot",
    script: "./server.js",
    watch: false,
    env: {
      NODE_ENV: "production",
      SSL_KEY_PATH: "./certs/privkey.pem",
      SSL_CERT_PATH: "./certs/fullchain.pem",
    },
    // Restart if memory exceeds 1GB
    max_memory_restart: '1G',
    // Delay between restarts if it crashes
    restart_delay: 4000
  }]
};