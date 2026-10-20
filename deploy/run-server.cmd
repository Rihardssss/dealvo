@echo off
rem Dealvo serveris: palaiz un, ja nokrit, palaiz no jauna pec 5 sekundem
cd /d "%~dp0.."
if not exist data mkdir data
:loop
echo [%date% %time%] Dealvo serveris startejas >> data\server.log
call npm start >> data\server.log 2>&1
echo [%date% %time%] serveris apstajas, restartejam >> data\server.log
timeout /t 5 /nobreak >nul
goto loop
