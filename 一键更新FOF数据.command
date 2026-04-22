#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

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
    read -n 1 -s -r -p "按任意键关闭窗口..."
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

PY_BIN="$(pick_python || true)"

if [ -z "$PY_BIN" ]; then
  echo "未找到可用且已安装 pandas 的 Python 3，请先安装或补齐环境。"
  exit 1
fi

cd "$ROOT_DIR"
echo "使用 Python: $PY_BIN"
AS_OF_DATE="$(prompt_as_of_date)"
run_snapshot_build "$AS_OF_DATE"
echo ""
echo "数据已更新。"
echo "你现在可以双击“\"一键打开FOF跟踪.command\"”查看页面。"
pause_if_interactive
