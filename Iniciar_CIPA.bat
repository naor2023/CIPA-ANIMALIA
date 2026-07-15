@echo off
title CIPA Animália Park
cd /d "%~dp0"
powershell.exe -NoLogo -NoExit -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
