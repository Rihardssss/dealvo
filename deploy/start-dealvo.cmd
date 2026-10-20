@echo off
rem Palaiz Dealvo serveri un tuneli fona (minimizetos logos)
cd /d "%~dp0"
start "Dealvo serveris" /min cmd /c run-server.cmd
timeout /t 10 /nobreak >nul
start "Dealvo tunelis" /min cmd /c run-tunnel.cmd
