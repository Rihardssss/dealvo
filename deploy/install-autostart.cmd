@echo off
rem Viena reize: Dealvo startejas pats, kad ielogojies Windows
schtasks /Create /TN "Dealvo" /TR "\"%~dp0start-dealvo.cmd\"" /SC ONLOGON /RL LIMITED /F
if errorlevel 1 (
  echo Neizdevas izveidot automatisko startu.
) else (
  echo Gatavs: Dealvo startesies pats katru reizi, kad ielogosies Windows.
)
pause
