# GSC deploy: build + serve https://localhost/ via Docker nginx
param([switch]$SkipBuild)
$r=Split-Path -Parent $PSScriptRoot
$c=Join-Path $PSScriptRoot "certs"
if(-not $SkipBuild){Push-Location $r;try{npm run build}finally{Pop-Location}}
if(!(Test-Path "$c\gsc.crt")){
$o="C:\Program Files\Git\usr\bin\openssl.exe"
$i=(Get-NetIPAddress -AddressFamily IPv4|?{$_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254*"}|%{$_.IPAddress})-join ",IP:"
$s="subjectAltName=DNS:localhost,DNS:gsc.local,IP:127.0.0.1,IP:$i"
&$o req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout "$c\gsc.key" -out "$c\gsc.crt" -subj "/CN=gsc.local" -addext $s 2>$null}
docker info *> $null
if($LASTEXITCODE -ne 0){Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe";1..24|%{Start-Sleep 5;docker info *> $null;if($LASTEXITCODE -eq 0){break}}}
docker rm -f gsc-nginx *> $null
docker run -d --name gsc-nginx -p 80:80 -p 443:443 -v "$r\dist:/usr/share/nginx/html:ro" -v "$r\deploy\nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$r\deploy\certs:/etc/nginx/certs:ro" skydash-frontend:latest
Write-Host "DONE: https://localhost/ (HTTP 301 -> HTTPS)"
