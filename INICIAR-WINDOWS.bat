@echo off
chcp 65001 >nul
title Nativa FM 1.9.1 - PWA
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao encontrado. Instale o Node.js 20 ou superior.
 echo https://nodejs.org/
 pause
 exit /b 1
)

REM Evita servir sem querer a versao anterior ainda ativa na porta 8080.
powershell -NoProfile -Command "try { $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8080); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
 echo.
 echo ATENCAO: ja existe um programa usando a porta 8080.
 echo Se a Nativa FM antiga estiver aberta, encerre a janela do servidor anterior.
 echo Esta versao NAO sera iniciada enquanto a porta estiver ocupada.
 echo Depois, execute novamente este arquivo.
 echo.
 pause
 exit /b 2
)

echo.
echo ===================================================
echo NATIVA FM - PROJETO ATUALIZADO - VERSAO 1.9.1
echo ===================================================
echo Pasta: %~dp0
echo Quando aparecer a confirmacao abaixo, abra:
echo http://localhost:8080/?v=1.9.1
echo.
node server.js
if errorlevel 1 pause
