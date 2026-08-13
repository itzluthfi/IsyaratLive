@echo off
REM Setup awal IsyaRasa — jalankan sekali di awal, atau setiap kali package.json berubah.

echo ===============================
echo IsyaRasa - Setup
echo ===============================

echo.
echo [1/3] Install dependencies backend...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 goto :error

if not exist ".env" (
  echo.
  echo [2/3] Membuat backend\.env dari .env.example...
  copy ".env.example" ".env" >nul
  echo   -^> Sudah dibuat. Buka backend\.env dan isi NINEROUTER_API_KEY ^& kredensial MySQL.
) else (
  echo.
  echo [2/3] backend\.env sudah ada, dilewati.
)

echo.
echo [3/3] Install dependencies frontend...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 goto :error

echo.
echo ===============================
echo Setup selesai.
echo Jalankan run.bat untuk memulai backend + frontend.
echo ===============================
pause
exit /b 0

:error
echo.
echo Terjadi error saat setup. Periksa pesan di atas.
pause
exit /b 1
