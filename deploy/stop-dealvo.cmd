@echo off
rem Aptur Dealvo serveri un tuneli
taskkill /fi "WINDOWTITLE eq Dealvo serveris*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Dealvo tunelis*" /t /f >nul 2>&1
taskkill /im cloudflared.exe /f >nul 2>&1
echo Dealvo apturets.
