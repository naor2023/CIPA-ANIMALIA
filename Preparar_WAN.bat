@echo off
title Preparar WAN - CIPA Animália Park
cd /d "%~dp0"
powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%~dp0Preparar_WAN.ps1"
