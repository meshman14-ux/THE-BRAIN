@echo off
REM Double-click this to publish THE BRAIN to the live site.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
