#!/usr/bin/env bash
# ============================================================
#  ctpbee Terminal — Dispatcher Frontend Installer
#  Supports: Linux (systemd service) | macOS (launchd) | WSL
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="ctpbee-terminal"
SERVICE_NAME="ctpbee-dispatcher-bridge"
VENV_DIR="$SCRIPT_DIR/.venv"
PYTHON="${PYTHON:-python3}"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

banner() {
  echo -e "${GREEN}"
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║   ctpbee Terminal · Frontend Installer         ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
}

ok()   { echo -e "  ${GREEN}[OK]${NC}  $*"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "  ${RED}[ERR]${NC} $*"; }
info() { echo -e "  ${CYAN}[..]${NC} $*"; }

# ── Pre-checks ──
check_python() {
  info "Checking Python..."
  if ! command -v "$PYTHON" &>/dev/null; then
    err "Python 3 not found. Install Python 3.8+ and retry."
    exit 1
  fi
  local ver; ver=$("$PYTHON" -c 'import sys; print(".".join(map(str,sys.version_info[:2])))')
  local major; major=$("$PYTHON" -c 'import sys; print(sys.version_info[0])')
  local minor; minor=$("$PYTHON" -c 'import sys; print(sys.version_info[1])')
  if (( major < 3 || (major == 3 && minor < 8) )); then
    err "Python $ver detected — need 3.8+"
    exit 1
  fi
  ok "Python $ver"
}

# ── Virtual environment ──
setup_venv() {
  if [[ -d "$VENV_DIR" ]]; then
    ok "venv already exists: $VENV_DIR"
  else
    info "Creating virtual environment..."
    "$PYTHON" -m venv "$VENV_DIR"
    ok "venv created"
  fi
  # Activate
  source "$VENV_DIR/bin/activate"
  # Ensure pip is current
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
}

# ── Dependencies ──
install_deps() {
  info "Installing Python dependencies..."
  "$VENV_DIR/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"
  ok "Dependencies installed"
}

# ── Configuration ──
write_env_file() {
  local env_file="$SCRIPT_DIR/.env"
  if [[ -f "$env_file" ]]; then
    ok ".env already exists, skipping"
    return
  fi
  info "Creating default .env..."
  cat > "$env_file" <<'EOF'
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
EOF
  ok ".env created — edit to configure Redis / ports"
}

# ── systemd service (Linux only) ──
install_systemd() {
  if ! command -v systemctl &>/dev/null; then
    warn "systemd not available — skipping service registration"
    return
  fi

  echo ""
  read -r -p "  Register as systemd service? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    info "Skipped service registration"
    return
  fi

  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
  local user; user="$(whoami)"

  info "Creating systemd service file..."
  # Use sudo if not root
  local SUDO=""
  if [[ "$EUID" -ne 0 ]]; then
    SUDO="sudo"
  fi

  $SUDO tee "$service_file" > /dev/null <<SERVICE_EOF
[Unit]
Description=ctpbee Dispatcher Bridge Server (ctpbee Terminal)
After=network-online.target redis.service
Wants=network-online.target

[Service]
Type=simple
User=$user
WorkingDirectory=$SCRIPT_DIR
EnvironmentFile=$SCRIPT_DIR/.env
ExecStart=$VENV_DIR/bin/python $SCRIPT_DIR/server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=no
ReadWritePaths=$SCRIPT_DIR
ReadOnlyPaths=$VENV_DIR

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  $SUDO systemctl daemon-reload
  ok "Service file created: $service_file"

  read -r -p "  Enable and start the service now? [y/N] " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    $SUDO systemctl enable "$SERVICE_NAME"
    $SUDO systemctl start "$SERVICE_NAME"
    $SUDO systemctl status "$SERVICE_NAME" --no-pager
    ok "Service is running!"
  else
    info "Manual start: sudo systemctl enable --now $SERVICE_NAME"
  fi
}

# ── macOS launchd (optional) ──
install_launchd() {
  if [[ "$(uname -s)" != "Darwin" ]]; then return; fi

  echo ""
  read -r -p "  Register as launchd service? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    info "Skipped launchd registration"
    return
  fi

  local plist="$HOME/Library/LaunchAgents/com.ctpbee.dispatcher-bridge.plist"
  cat > "$plist" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ctpbee.dispatcher-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$VENV_DIR/bin/python</string>
    <string>$SCRIPT_DIR/server.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CTPBEE_REDIS_HOST</key><string>127.0.0.1</string>
    <key>CTPBEE_REDIS_PORT</key><string>6379</string>
    <key>CTPBEE_WS_PORT</key><string>8765</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$SCRIPT_DIR/logs/stdout.log</string>
  <key>StandardErrorPath</key><string>$SCRIPT_DIR/logs/stderr.log</string>
</dict>
</plist>
PLIST_EOF

  mkdir -p "$SCRIPT_DIR/logs"
  launchctl load "$plist"
  ok "launchd service registered and started"
  ok "  Status: launchctl list | grep ctpbee"
  ok "  Stop:   launchctl unload $plist"
}

# ── Summary ──
summary() {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Installation Complete${NC}"
  echo ""
  echo -e "  Frontend:  ${CYAN}file://$SCRIPT_DIR/ctpbee-frontend/index.html${NC}"
  echo -e "  Server:    ${GREEN}$VENV_DIR/bin/python $SCRIPT_DIR/server.py${NC}"
  echo ""
  echo -e "  Start manually:"
  echo -e "    source $VENV_DIR/bin/activate"
  echo -e "    python $SCRIPT_DIR/server.py"
  echo ""
  echo -e "  Manage service:"
  if command -v systemctl &>/dev/null; then
    echo -e "    sudo systemctl status $SERVICE_NAME"
    echo -e "    sudo journalctl -u $SERVICE_NAME -f"
  fi
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Main ──
main() {
  banner
  check_python
  setup_venv
  install_deps
  write_env_file
  install_systemd
  install_launchd
  summary
}

main "$@"
