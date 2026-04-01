#!/bin/bash
set -e

echo "=== Media-Manager Starting ==="

# Initialize data directory structure
mkdir -p /app/data/backup
mkdir -p /app/data/mediamtx
mkdir -p /app/logs

# Initialize configuration files if they don't exist
if [ ! -f /app/data/config.json ]; then
    echo "Creating default config.json..."
    cat > /app/data/config.json <<EOF
{
  "server": {
    "name": "Media Manager",
    "ip": "",
    "timezone": "Europe/Rome"
  },
  "mediamtx": {
    "rtspPort": 554,
    "hlsPort": 8888,
    "username": "",
    "password": "",
    "apiPort": 8890
  },
  "dashboard": {
    "logo": "",
    "theme": "auto",
    "autoRefresh": true,
    "refreshInterval": 5
  }
}
EOF
fi

if [ ! -f /app/data/tasks.json ]; then
    echo "Creating default tasks.json..."
    cat > /app/data/tasks.json <<EOF
{
  "tasks": []
}
EOF
fi

# Set correct permissions
chown -R node:node /app/data
chmod -R 755 /app/data

# Start cron service for scheduled tasks
# service cron start

echo "=== Checking FFmpeg installation ==="
ffmpeg -version | head -n 1

echo "=== Configuration initialized ==="
echo "Web UI will be available at: http://localhost:3000"
echo "RTSP port: 554"
echo "HLS port: 8888"

# Execute the main command
exec "$@"