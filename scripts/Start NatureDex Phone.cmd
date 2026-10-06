@echo off
cd /d "%~dp0.."
call npm run build
if errorlevel 1 goto finished
call npm run phone
:finished
pause
