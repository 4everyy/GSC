#!/usr/bin/env bash
# GSC 前端一键部署脚本（在服务器上以 sudo 执行）
# 前置条件: /tmp/dist 为构建产物目录, /tmp/gsc.conf 为 nginx 站点配置
set -euo pipefail

echo "[1/6] deploy static files to /var/www/gsc"
mkdir -p /var/www/gsc
rm -rf /var/www/gsc/*
cp -a /tmp/dist/. /var/www/gsc/

echo "[2/6] install nginx site config"
cp /tmp/gsc.conf /etc/nginx/sites-available/gsc
ln -sf /etc/nginx/sites-available/gsc /etc/nginx/sites-enabled/gsc
rm -f /etc/nginx/sites-enabled/default

echo "[3/6] set permissions"
chown -R www-data:www-data /var/www/gsc
chmod -R a+rX /var/www/gsc

echo "[4/6] nginx syntax check"
nginx -t

echo "[5/6] reload nginx"
systemctl reload nginx

echo "[6/6] local verification"
sleep 1
curl -s -o /dev/null -w "GET /                    -> %{http_code}\n" http://localhost/
curl -s -o /dev/null -w "GET /maps/suzhou.mbtiles -> %{http_code}\n" -r 0-1024 http://localhost/maps/suzhou.mbtiles

echo "DONE: visit http://192.168.120.232/"