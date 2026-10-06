@echo off
cd /d "%~dp0.."
set NATUREDEX_MODEL_ENABLED=1
set NATUREDEX_DEVICE=cpu
set HF_HUB_OFFLINE=1
set OMP_NUM_THREADS=8
set MKL_NUM_THREADS=8
".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
pause
