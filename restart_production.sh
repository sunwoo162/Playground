#!/bin/bash
echo "Restarting production processes..."

# pm2 재시작
pm2 delete playground coding-log cornell-notes 2>/dev/null || true
pm2 start ecosystem.config.js --only playground

# nginx 리로드
sudo systemctl reload nginx 2>/dev/null || true

echo "Done!"
