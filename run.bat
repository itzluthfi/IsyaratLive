@echo off
REM Jalankan backend + frontend IsyaRasa sekaligus (masing-masing di jendela terpisah).
REM Jalankan setup.bat lebih dulu kalau belum pernah npm install.

if not exist "%~dp0backend\node_modules" (
  echo backend\node_modules belum ada. Jalankan setup.bat dulu.
  pause
  exit /b 1
)
if not exist "%~dp0frontend\node_modules" (
  echo frontend\node_modules belum ada. Jalankan setup.bat dulu.
  pause
  exit /b 1
)
if not exist "%~dp0backend\.env" (
  echo backend\.env belum ada. Jalankan setup.bat dulu, lalu isi kredensialnya.
  pause
  exit /b 1
)

echo Membuka backend (http://localhost:3001) dan frontend (https://localhost:5173) di jendela terpisah...

start "IsyaRasa - Backend" cmd /k "cd /d "%~dp0backend" && npm run dev"
start "IsyaRasa - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Kedua server sedang start di jendela baru. Tutup jendela itu untuk mematikan masing-masing server.
