@echo off
rem Viss viena klikski: iepuso GitHub, uzliek Dealvo uz Linux servera, aptur Windows versiju.
setlocal
cd /d "%~dp0.."
set "KEY=%USERPROFILE%\.cloudflared\ad81e4ab-bb8f-492b-bc94-18fbb159ddcf.json"
if not exist "%KEY%" (
  echo Nav atrasts tunela fails: %KEY%
  pause & exit /b 1
)

set /p HOST=Servera IP adrese (ta pati, ko liec WinSCP): 
set "SUSER=ubuntu"
set /p SUSER=Lietotajs [ubuntu]: 

echo.
echo === 1/4 GitHub ===
git add -A
git commit -m "servera skripti"
git push

echo.
echo === 2/4 Tunela atslega uz serveri (prasis servera paroli) ===
type "%KEY%" | ssh -o StrictHostKeyChecking=accept-new %SUSER%@%HOST% "mkdir -p ~/.cloudflared && cat > ~/.cloudflared/ad81e4ab-bb8f-492b-bc94-18fbb159ddcf.json && chmod 600 ~/.cloudflared/*.json && echo atslega ielikta"
if errorlevel 1 ( echo Neizdevas pieslegties serverim. & pause & exit /b 1 )

echo.
echo === 3/4 Uzstadisana uz servera (1-3 min, var prasit paroli vel reizi) ===
ssh -t %SUSER%@%HOST% "if [ -d ~/dealvo/.git ]; then cd ~/dealvo && git pull; else git clone https://github.com/Rihardssss/dealvo.git ~/dealvo; fi && bash ~/dealvo/deploy/setup-server.sh"
if errorlevel 1 ( echo Uzstadisana neizdevas, atsuti man ekranu. & pause & exit /b 1 )

echo.
echo === 4/4 Aptur Windows versiju ===
call "%~dp0stop-dealvo.cmd"
schtasks /Delete /TN Dealvo /F >nul 2>&1

echo.
echo Gatavs! Atver https://dealvo.riciboy.eu
pause
