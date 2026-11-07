@echo off
chcp 65001 >nul
title Nativa FM - PWA e Streaming
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao encontrado. Instale Node.js 20 ou superior em https://nodejs.org/
 pause
 exit /b 1
)
echo Iniciando Nativa FM... Abra http://localhost:8080
node server.js
if errorlevel 1 pause
