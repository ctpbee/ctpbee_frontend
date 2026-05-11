#!/usr/bin/env python3
"""
ctpbee Terminal — 统一启动器
一键启动 WebSocket 桥接服务器 + HTTP 前端服务

用法:
    python start.py              # 启动全部服务
    python start.py --no-bridge  # 仅启动前端 HTTP 服务
    python start.py --no-http    # 仅启动桥接服务器
    python start.py --dev        # 开发模式（文件变更自动重载桥接服务器）
"""

import asyncio
import os
import signal
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "ctpbee-frontend"

# ── 默认配置 ──
HTTP_HOST = os.environ.get("CTPBEE_HTTP_HOST", "127.0.0.1")
HTTP_PORT = int(os.environ.get("CTPBEE_HTTP_PORT", 8000))
WS_URL = f"http://{HTTP_HOST}:{HTTP_PORT}/ctpbee-frontend/index.html"


def print_banner():
    print(r"""
  ╔══════════════════════════════════════════════╗
  ║       ctpbee Terminal · 统一启动器             ║
  ╚══════════════════════════════════════════════╝
    """)


def run_bridge(dev_mode=False):
    """启动 WebSocket ↔ Redis 桥接服务器"""
    args = [sys.executable, str(ROOT / "server.py")]
    if dev_mode:
        args.append("--dev")
    print(f"  [bridge] 启动桥接服务器...")
    return subprocess.Popen(args, stdout=sys.stdout, stderr=sys.stderr)


def run_http():
    """启动 HTTP 静态文件服务器（前端页面）"""
    import http.server
    import socketserver

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def log_message(self, format, *args):
            # 精简日志
            if "/ctpbee-frontend/" in str(args[0]) or args[0] == "GET":
                print(f"  [http] {args[0]}")

    with socketserver.TCPServer((HTTP_HOST, HTTP_PORT), Handler) as httpd:
        print(f"  [http]  前端服务已启动 → http://{HTTP_HOST}:{HTTP_PORT}")
        print(f"  [http]  交易终端     → {WS_URL}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            httpd.server_close()
            print("  [http]  已停止")


def main():
    print_banner()

    # 解析参数
    args = set(sys.argv[1:])
    no_bridge = "--no-bridge" in args
    no_http = "--no-http" in args
    dev_mode = "--dev" in args

    if no_bridge and no_http:
        print("  错误: 至少需要启动一个服务")
        sys.exit(1)

    # ── 确保 ctpbee 已安装 ──
    try:
        import ctpbee
    except ImportError:
        print("  警告: ctpbee 未安装，仅启动前端演示模式")
        print("  安装: pip install ctpbee>=1.7.4\n")

    processes = []

    def cleanup():
        print("\n  正在关闭所有服务...")
        for p in processes:
            try:
                p.terminate()
                p.wait(timeout=5)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass

    # 捕获 Ctrl+C
    def on_signal(sig, frame):
        cleanup()
        sys.exit(0)

    signal.signal(signal.SIGINT, on_signal)

    try:
        # 启动桥接服务器（子进程）
        if not no_bridge:
            p = run_bridge(dev_mode=dev_mode)
            processes.append(p)
            # 给桥接服务器一点启动时间
            import time
            time.sleep(0.5)

        # 启动 HTTP 服务器（主线程阻塞）
        if not no_http:
            run_http()
        else:
            # 没有 HTTP 服务器时，等待桥接进程
            print("\n  按 Ctrl+C 停止所有服务...")
            for p in processes:
                p.wait()
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()

    print("  已全部停止。")


if __name__ == "__main__":
    main()
