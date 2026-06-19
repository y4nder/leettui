#Requires -Version 5
<#
.SYNOPSIS
  leettui installer (Windows) — downloads the latest release binary.

  irm https://raw.githubusercontent.com/y4nder/leettui/main/install.ps1 | iex

  Overrides (set as environment variables before running, since `| iex` can't
  take arguments):
    $env:LEETTUI_INSTALL_DIR = "C:\tools\bin"   install location (default: %LOCALAPPDATA%\leettui\bin)
    $env:LEETTUI_VERSION     = "v0.1.0"          pin a version (default: latest)

  This is the Windows counterpart to install.sh (Linux/macOS). Windows ships
  only the raw `.exe` asset — there's no `.gz` sibling and no self-update path
  (`leettui update` refuses on Windows, since you can't rename over a running,
  file-locked `.exe`), so updating means re-running this script. Keep the asset/
  URL logic in sync with install.sh and src/core/update.ts if the release matrix
  changes.
#>

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host ":: " -ForegroundColor Cyan -NoNewline; Write-Host $msg }

# The script is meant to be run via `irm … | iex`, which executes in the
# *caller's* PowerShell session — so a bare `exit` would close the user's
# terminal. Instead `Fail` throws, the body runs inside a try/catch, and the
# catch prints a clean message and simply returns to the prompt.
function Fail($msg) { throw $msg }

try {
    # Stock Windows PowerShell 5.1 may default to TLS 1.0/1.1, which GitHub
    # rejects — force TLS 1.2 so the download doesn't fail with an opaque
    # connection error. (One line: a trailing-space-after-backtick continuation
    # is too easy to break silently.)
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $Repo = 'y4nder/leettui'

    $InstallDir = $env:LEETTUI_INSTALL_DIR
    if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'leettui\bin' }

    $Version = $env:LEETTUI_VERSION
    if (-not $Version) { $Version = 'latest' }

    Write-Host ''
    Write-Host '█   █▀▀ █▀▀ ▀█▀ ▀█▀ █ █ █' -ForegroundColor Cyan
    Write-Host '█   █▀  █▀   █   █  █ █ █' -ForegroundColor Cyan
    Write-Host '█▄▄ █▄▄ █▄▄  █   █  █▄█ █' -ForegroundColor Cyan
    Write-Host 'LeetCode in your terminal' -ForegroundColor DarkGray
    Write-Host ''

    # The release workflow builds only a 64-bit Windows binary
    # (leettui-windows-x64.exe). On ARM64 Windows the x64 build runs under the
    # built-in x64 emulation, so it's the right asset there too — only 32-bit x86
    # has nothing to install. PROCESSOR_ARCHITECTURE reports 'x86' under a 32-bit
    # PowerShell host on 64-bit Windows (WOW64); ARCHITEW6432 carries the real
    # arch there, so prefer it when set to avoid a false "unsupported" error.
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -eq 'x86' -and $env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
    if ($arch -ne 'AMD64' -and $arch -ne 'ARM64') {
        Fail "unsupported architecture '$arch' — leettui needs 64-bit Windows"
    }

    $asset = 'leettui-windows-x64.exe'
    $url = if ($Version -eq 'latest') {
        "https://github.com/$Repo/releases/latest/download/$asset"
    } else {
        "https://github.com/$Repo/releases/download/$Version/$asset"
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $dest = Join-Path $InstallDir 'leettui.exe'
    $tmp  = "$dest.download"

    Write-Step "Downloading $asset ($Version)…"
    # Download to a temp file first so an interrupted transfer can never corrupt
    # an existing install. IWR's progress bar crawls on PS 5.1, so suppress it
    # (restoring after, since we're in the caller's session).
    $prevProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    } catch {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        Fail "download failed from $url`n  $($_.Exception.Message)"
    } finally {
        $ProgressPreference = $prevProgress
    }

    # Move the new binary into place — this same path serves both fresh installs
    # and updates (there's no in-place `leettui update` on Windows). On the same
    # volume this is a single replace: it either swaps cleanly or, if leettui.exe
    # is locked by a running instance, fails *without touching* the existing
    # binary — so a failed update never leaves you with no leettui at all.
    try {
        Move-Item -Path $tmp -Destination $dest -Force
    } catch {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        Fail "couldn't write $dest`n  $($_.Exception.Message)`n  If leettui is running, close it and run this again."
    }

    Write-Host "OK " -ForegroundColor Green -NoNewline
    Write-Host "Installed leettui to $dest"

    # Add the install dir to the *user* PATH (no admin needed) if it isn't
    # already there, and make it live in the current session too.
    # SetEnvironmentVariable with the 'User' scope persists across reboots;
    # $env:Path only affects this process.
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $onPath = $userPath -and (($userPath -split ';') -contains $InstallDir)
    if (-not $onPath) {
        $newPath = if ([string]::IsNullOrEmpty($userPath)) { $InstallDir } else { "$userPath;$InstallDir" }
        [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
        $env:Path = "$env:Path;$InstallDir"
        Write-Host ''
        Write-Host "Added $InstallDir to your PATH. " -NoNewline
        Write-Host 'Open a new terminal' -ForegroundColor Cyan -NoNewline
        Write-Host ' for it to take effect, then run:'
    } else {
        Write-Host ''
        Write-Host 'Run:'
    }
    Write-Host '  leettui' -ForegroundColor Cyan -NoNewline
    Write-Host " — it'll walk you through signing in."
}
catch {
    # Reached on any Fail (or other terminating error). Print a clean message and
    # return to the prompt — never `exit`, which would close the iex host shell.
    Write-Host ''
    Write-Host 'error: ' -ForegroundColor Red -NoNewline
    Write-Host $_.Exception.Message
}
