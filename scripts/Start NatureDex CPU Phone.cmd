@echo off
cd /d "%~dp0.."
set NATUREDEX_MODEL_ENABLED=1
set NATUREDEX_DEVICE=cpu
set HF_HUB_OFFLINE=1
set OMP_NUM_THREADS=8
set MKL_NUM_THREADS=8
set NATUREDEX_TUNNEL_PROTOCOL=http2
call npm run build
if errorlevel 1 goto finished
call npm run phone
:finished
pause
