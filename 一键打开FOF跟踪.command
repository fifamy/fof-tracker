#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${FOF_TRACKER_PORT:-8766}"
PID_FILE="$ROOT_DIR/.fof_tracker_server.pid"
HTTP_LOG="${FOF_TRACKER_HTTP_LOG:-/tmp/fof_tracker_http.log}"

pick_python() {
  for bin in "$ROOT_DIR/.venv/bin/python" /Users/menyao/anaconda/bin/python3.6 /Users/menyao/anaconda/bin/python3 python3.11 python3.10 python3.9 python3.8 python3.7 python3.6 python3; do
    if [ -x "$bin" ]; then
      if PYTHONIOENCODING=utf-8 "$bin" -c "import pandas" >/dev/null 2>&1; then
        echo "$bin"
        return 0
      fi
    elif command -v "$bin" >/dev/null 2>&1; then
      CANDIDATE="$(command -v "$bin")"
      if PYTHONIOENCODING=utf-8 "$CANDIDATE" -c "import pandas" >/dev/null 2>&1; then
        echo "$CANDIDATE"
        return 0
      fi
    fi
  done
  return 1
}

pause_if_interactive() {
  if [ -t 0 ] && [ -t 1 ]; then
    read -n 1 -s -r -p "按任意键关闭窗口（不会关闭网页）..."
    echo ""
  fi
}

prompt_as_of_date() {
  local input_date=""

  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    echo "如需手动指定统计截止日，请输入 YYYY-MM-DD；直接回车则自动识别。" > /dev/tty
    echo "例如：数据最新事件还没更新到你要的口径日时，可手动输入最后截止日。" > /dev/tty
    read -r -p "截止日: " input_date < /dev/tty
  fi

  echo "$input_date"
}

run_snapshot_build() {
  local as_of_date="$1"
  local -a cmd=("$PY_BIN" "$ROOT_DIR/scripts/build_fof_tracker_snapshot.py")

  if [ -n "$as_of_date" ]; then
    cmd+=("--as-of-date" "$as_of_date")
  fi

  PYTHONIOENCODING=utf-8 "${cmd[@]}"
}

open_url() {
  local url="$1"

  if command -v open >/dev/null 2>&1; then
    if open "$url" >/dev/null 2>&1; then
      return 0
    fi
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    if xdg-open "$url" >/dev/null 2>&1; then
      return 0
    fi
  fi

  if [ -n "$PY_BIN" ]; then
    if PYTHONIOENCODING=utf-8 "$PY_BIN" -m webbrowser "$url" >/dev/null 2>&1; then
      return 0
    fi
  fi

  return 1
}

PY_BIN="$(pick_python || true)"

if [ -z "$PY_BIN" ]; then
  echo "未找到可用且已安装 pandas 的 Python 3，请先安装或补齐环境。"
  exit 1
fi

cd "$ROOT_DIR"
echo "使用 Python: $PY_BIN"
AS_OF_DATE="$(prompt_as_of_date)"
run_snapshot_build "$AS_OF_DATE"

OLD_PORT_PID="$(lsof -ti TCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$OLD_PORT_PID" ]; then
  kill "$OLD_PORT_PID" >/dev/null 2>&1 || true
  sleep 1
fi

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
    kill "$OLD_PID" >/dev/null 2>&1 || true
    sleep 1
  fi
fi

cd "$ROOT_DIR"
nohup "$PY_BIN" -m http.server "$PORT" >"$HTTP_LOG" 2>&1 &
SERVER_PID="$!"
echo "$SERVER_PID" > "$PID_FILE"
sleep 1

if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "本地网页服务启动失败，请查看日志：$HTTP_LOG"
  if [ -f "$HTTP_LOG" ]; then
    tail -n 20 "$HTTP_LOG"
  fi
  exit 1
fi

URL_BASE="http://127.0.0.1:${PORT}/"
URL="${URL_BASE}?ts=$(date +%s)"
echo ""
if open_url "$URL"; then
  echo "系统已打开：$URL"
else
  echo "未能自动打开浏览器，请手动访问：$URL"
fi
echo "如果页面已打开但没刷新，也可以手动访问：${URL_BASE}"
echo "如果下次还要看，直接双击这个文件即可。"
pause_if_interactive
