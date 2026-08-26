@echo off
chcp 65001 >nul
title Misio — Red Local (HTTPS)
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  MISIO — Modo red local con HTTPS               ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ── 1. Detectar tu IP local ─────────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4" ^| findstr "192.168"') do (
    set "LOCAL_IP=%%a"
)
set LOCAL_IP=%LOCAL_IP: =%
if "%LOCAL_IP%"=="" (
    echo [!] No se encontro IP 192.168.x.x — revisa tu conexion Wi-Fi.
    pause
    exit /b 1
)
echo [✓] Tu IP local: %LOCAL_IP%

:: ── 2. Generar certificados (una sola vez) ──────────────────────────
if not exist "server\certs\dev.pem" (
    echo [*] Generando certificados HTTPS para red local...
    mkdir server\certs 2>nul

    :: Intentar con mkcert primero (mejor experiencia)
    where mkcert >nul 2>nul
    if %errorlevel%==0 (
        echo [*] Usando mkcert...
        mkcert -cert-file server\certs\dev.pem -key-file server\certs\dev-key.pem %LOCAL_IP% localhost 127.0.0.1
    ) else (
        echo [*] mkcert no encontrado, usando openssl...
        where openssl >nul 2>nul
        if %errorlevel%==0 (
            openssl req -x509 -newkey rsa:2048 -keyout server\certs\dev-key.pem -out server\certs\dev.pem -days 365 -nodes -subj "/CN=%LOCAL_IP%" -addext "subjectAltName=IP:%LOCAL_IP%,DNS:localhost,IP:127.0.0.1"
        ) else (
            echo [!] Necesitas mkcert o openssl. Instala uno:
            echo     choco install mkcert
            echo     o: choco install openssl
            pause
            exit /b 1
        )
    )
    echo [✓] Certificados creados en server\certs\
) else (
    echo [✓] Certificados ya existen
)

:: ── 3. Variables de entorno ─────────────────────────────────────────
set MONGO_URI=mongodb://localhost:27017/misio
set JWT_SECRET=misio-dev-local-2026
set CLIENT_URL=https://%LOCAL_IP%:5173
set PORT=3000
set VITE_API_URL=https://%LOCAL_IP%:3000/api/v1

echo.
echo [*] Frontend: https://%LOCAL_IP%:5173
echo [*] Backend:  https://%LOCAL_IP%:3000/api/v1
echo.
echo     Desde tu celular abre: https://%LOCAL_IP%:5173
echo     (Dale "Avanzado - Continuar" al aviso del certificado)
echo.

:: ── 4. Levantar ambos servidores en paralelo ────────────────────────
echo [*] Levantando backend...
start "Misio API" cmd /k "cd /d %~dp0server && npm run start:dev"

:: Esperar a que el backend arranque
timeout /t 5 /nobreak >nul

echo [*] Levantando frontend...
start "Misio Client" cmd /k "cd /d %~dp0client && npx vite"

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  ✓ Ambos servidores levantados                   ║
echo  ║  Celular: https://%LOCAL_IP%:5173               ║
echo  ║  Panel:   https://%LOCAL_IP%:5173/admin          ║
echo  ║                                                  ║
echo  ║  Cierra esta ventana para detener todo.          ║
echo  ╚══════════════════════════════════════════════════╝
echo.
pause
