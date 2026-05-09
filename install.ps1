# ============================================================
#  ctpbee Terminal — Dispatcher Frontend Installer
#  Windows PowerShell script
#  Usage: powershell -ExecutionPolicy Bypass -File install.ps1
# ============================================================
param(
    [switch]$NoService,
    [switch]$NoVenv,
    [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectName = "ctpbee-terminal"
$ServiceName = "ctpbee-dispatcher-bridge"
$VenvDir = Join-Path $ScriptDir ".venv"

# ── Colors ──
function Write-OK   { Write-Host "  [OK]  " -NoNewline -ForegroundColor Green; Write-Host $args }
function Write-Warn { Write-Host "  [WARN] " -NoNewline -ForegroundColor Yellow; Write-Host $args }
function Write-Err  { Write-Host "  [ERR]  " -NoNewline -ForegroundColor Red; Write-Host $args }
function Write-Info { Write-Host "  [..]  " -NoNewline -ForegroundColor Cyan; Write-Host $args }

# ── Banner ──
Write-Host ""
Write-Host "  ctpbee Terminal · Frontend Installer (Windows)" -ForegroundColor Green
Write-Host ""

# ── Find Python ──
function Find-Python {
    Write-Info "Checking Python..."
    $candidates = @()
    if ($PythonPath) { $candidates += $PythonPath }
    $candidates += "python3", "python"

    foreach ($cmd in $candidates) {
        try {
            $v = & $cmd -c "import sys; print(sys.version)" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-OK "Python: $cmd`n       $(($v -split '\n')[0])"
                return $cmd
            }
        } catch {}
    }
    Write-Err "Python 3.8+ not found. Install from https://python.org and retry."
    Write-Err "Make sure 'Add Python to PATH' is checked during installation."
    exit 1
}

$PythonExe = Find-Python

# Check version
$major = & $PythonExe -c "import sys; print(sys.version_info[0])"
$minor = & $PythonExe -c "import sys; print(sys.version_info[1])"
if ([int]$major -lt 3 -or ([int]$major -eq 3 -and [int]$minor -lt 8)) {
    Write-Err "Python $major.$minor detected — need 3.8+"
    exit 1
}

# ── Virtual environment ──
if (-not $NoVenv) {
    if (Test-Path $VenvDir) {
        Write-OK "venv already exists: $VenvDir"
    } else {
        Write-Info "Creating virtual environment..."
        & $PythonExe -m venv $VenvDir
        Write-OK "venv created"
    }
    $PipExe = Join-Path $VenvDir "Scripts\pip.exe"
    $PythonVenv = Join-Path $VenvDir "Scripts\python.exe"
    Write-Info "Upgrading pip..."
    & $PipExe install --quiet --upgrade pip 2>$null
} else {
    $PipExe = $PythonExe.Replace("python", "pip")
    if (-not (Get-Command $PipExe -ErrorAction SilentlyContinue)) {
        $PipExe = "$PythonExe -m pip"
    }
    $PythonVenv = $PythonExe
}

# ── Install dependencies ──
Write-Info "Installing Python dependencies..."
$reqFile = Join-Path $ScriptDir "requirements.txt"
if (Test-Path $reqFile) {
    & $PipExe install --quiet -r $reqFile
} else {
    Write-Warn "requirements.txt not found, installing minimal deps"
    & $PipExe install --quiet websockets redis
}
Write-OK "Dependencies installed"

# ── Default .env ──
$envFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Info "Creating default .env..."
    @"
# ctpbee Redis connection
CTPBEE_REDIS_HOST=127.0.0.1
CTPBEE_REDIS_PORT=6379
CTPBEE_REDIS_DB=0

# ctpbee Dispatcher channels
CTPBEE_ORDER_UP_KERNEL=ctpbee_order_up_kernel
CTPBEE_ORDER_DOWN_KERNEL=ctpbee_order_down_kernel
CTPBEE_TICK_KERNEL=ctpbee_tick_kernel

# WebSocket bridge server
CTPBEE_WS_HOST=0.0.0.0
CTPBEE_WS_PORT=8765
"@ | Out-File -FilePath $envFile -Encoding utf8
    Write-OK ".env created"
} else {
    Write-OK ".env already exists"
}

# ── Windows Service via NSSM or scheduled task ──
if (-not $NoService) {
    Write-Host ""
    $nssm = Get-Command nssm -ErrorAction SilentlyContinue

    if ($nssm) {
        # ── NSSM preferred ──
        Write-Info "NSSM detected — can register as Windows service"
        $answer = Read-Host "  Register as Windows service? [y/N]"
        if ($answer -match '^[Yy]') {
            Write-Info "Installing service via NSSM..."
            $serverScript = Join-Path $ScriptDir "server.py"
            & nssm install $ServiceName $PythonVenv $serverScript
            & nssm set $ServiceName AppDirectory $ScriptDir
            & nssm set $ServiceName DisplayName "ctpbee Dispatcher Bridge"
            & nssm set $ServiceName Description "WebSocket bridge for ctpbee Dispatcher mode"
            & nssm set $ServiceName Start SERVICE_AUTO_START
            Write-OK "Service installed: $ServiceName"

            $answer2 = Read-Host "  Start the service now? [y/N]"
            if ($answer2 -match '^[Yy]') {
                & nssm start $ServiceName
                Write-OK "Service started"
            } else {
                Write-Info "Manual start: nssm start $ServiceName"
            }
        }
    } else {
        # ── Scheduled Task fallback ──
        Write-Info "NSSM not found (install via: winget install nssm)"
        Write-Info "Falling back to Scheduled Task option..."
        $answer = Read-Host "  Create startup scheduled task? [y/N]"
        if ($answer -match '^[Yy]') {
            $taskName = "ctpbee-dispatcher-bridge"
            $serverScript = Join-Path $ScriptDir "server.py"

            # Remove existing task if present
            schtasks /delete /tn $taskName /f 2>$null

            $action = New-ScheduledTaskAction -Execute $PythonVenv `
                -Argument $serverScript `
                -WorkingDirectory $ScriptDir
            $trigger = New-ScheduledTaskTrigger -AtStartup
            $settings = New-ScheduledTaskSettingsSet `
                -AllowStartIfOnBatteries `
                -DontStopIfGoingOnBatteries `
                -RestartCount 3 `
                -RestartInterval (New-TimeSpan -Minutes 1)
            $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
                -LogonType Interactive `
                -RunLevel LeastPrivilege

            Register-ScheduledTask -TaskName $taskName `
                -Action $action `
                -Trigger $trigger `
                -Settings $settings `
                -Principal $principal `
                -Description "ctpbee Dispatcher Bridge Server" | Out-Null

            Write-OK "Scheduled task '$taskName' created (runs at startup)"

            $answer2 = Read-Host "  Run the task now? [y/N]"
            if ($answer2 -match '^[Yy]') {
                Start-ScheduledTask -TaskName $taskName
                Write-OK "Task started"
            }
        }
    }
}

# ── Summary ──
$frontendPath = Join-Path $ScriptDir "ctpbee-frontend\index.html"
Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host "  Installation Complete" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  file:///$($frontendPath -replace '\\','/')" -ForegroundColor Cyan
Write-Host "  Server:    $PythonVenv $ScriptDir\server.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Start manually:" -ForegroundColor White
Write-Host "    $VenvDir\Scripts\activate" -ForegroundColor DarkGray
Write-Host "    python $ScriptDir\server.py" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host ""
