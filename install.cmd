@echo off
rem leettui installer (Windows, cmd.exe) — the Command Prompt counterpart to the
rem PowerShell one-liner. Meant to be run as:
rem
rem   curl -fsSL https://raw.githubusercontent.com/y4nder/leettui/main/install.cmd -o install.cmd && install.cmd && del install.cmd
rem
rem Overrides (set before running, since the download form can't take arguments):
rem   set LEETTUI_INSTALL_DIR=C:\tools\bin   install location (default: %LOCALAPPDATA%\leettui\bin)
rem   set LEETTUI_VERSION=v0.1.0             pin a version (default: latest)
rem
rem This is a thin shim: all real logic (TLS, arch check, atomic download/swap,
rem user-PATH edit) lives in install.ps1, which this invokes via PowerShell. Keep
rem the install logic there — don't reimplement it here. The `set` overrides above
rem are inherited by the child PowerShell process, which reads them as $env:...
rem
rem The TLS 1.2 line runs before the fetch so the install.ps1 download itself
rem succeeds on stock PowerShell 5.1 (which may default to TLS 1.0/1.1 that GitHub
rem rejects). install.ps1 prints its own clean errors, so no handling is needed here.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/y4nder/leettui/main/install.ps1 | iex"
