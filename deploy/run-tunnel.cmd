@echo off
rem Cloudflare tunelis uz dealvo.riciboy.eu: palaiz un, ja atvienojas, palaiz no jauna
cd /d "%~dp0.."
if not exist data mkdir data
:loop
echo [%date% %time%] tunelis startejas >> data\tunnel.log
cloudflared tunnel run --url http://localhost:3000 dealvo >> data\tunnel.log 2>&1
echo [%date% %time%] tunelis apstajas, restartejam >> data\tunnel.log
timeout /t 10 /nobreak >nul
goto loop
