#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
PAGES_DIR="${FOF_TRACKER_PAGES_DIR:-$PROJECT_ROOT/fof-tracker-pages}"

pick_python() {
  for bin in "$ROOT_DIR/.venv/bin/python" python3.11 python3.10 python3.9 python3.8 python3.7 python3 /Users/menyao/anaconda/bin/python3 /Users/menyao/anaconda/bin/python3.6 python3.6; do
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
  shift
  local -a cmd=("$PY_BIN" "$ROOT_DIR/scripts/build_fof_tracker_snapshot.py" "$@")

  if [ -n "$as_of_date" ]; then
    cmd+=("--as-of-date" "$as_of_date")
  fi

  PYTHONIOENCODING=utf-8 "${cmd[@]}"
}

sync_pages_dir() {
  mkdir -p "$PAGES_DIR/data"
  cp "$ROOT_DIR/index.html" "$PAGES_DIR/index.html"
  cp "$ROOT_DIR/styles.css" "$PAGES_DIR/styles.css"
  cp "$ROOT_DIR/app.js" "$PAGES_DIR/app.js"
  cp "$ROOT_DIR/data/fof_tracker_snapshot.js" "$PAGES_DIR/data/fof_tracker_snapshot.js"
  cp "$ROOT_DIR/data/fof_tracker_snapshot.json" "$PAGES_DIR/data/fof_tracker_snapshot.json"
  echo "已同步展示文件到: $PAGES_DIR"
}

publish_pages_dir() {
  local message="$1"
  local current_branch=""

  if [ ! -d "$PAGES_DIR/.git" ]; then
    echo "未找到 GitHub Pages 展示仓库：$PAGES_DIR"
    echo "请先确认 ../fof-tracker-pages 已存在，并且是一个 Git 仓库。"
    return 1
  fi

  cd "$PAGES_DIR"
  git add .

  if git diff --cached --quiet; then
    echo "展示仓库没有新的变化，已跳过提交和推送。"
    return 0
  fi

  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [ -z "$current_branch" ] || [ "$current_branch" = "HEAD" ]; then
    current_branch="main"
  fi

  git commit -m "$message"
  git push -u origin "$current_branch"
  echo "展示页已发布到 Git 仓库。"
}

PY_BIN="$(pick_python || true)"

if [ -z "$PY_BIN" ]; then
  echo "未找到可用且已安装 pandas 的 Python 3，请先安装或补齐环境。"
  exit 1
fi

echo "使用 Python: $PY_BIN"
AS_OF_DATE="$(prompt_as_of_date)"
echo ""
echo "第 1 步：更新 FOF 数据..."
run_snapshot_build "$AS_OF_DATE" --cleanup-old-excels

echo ""
echo "第 2 步：同步展示目录..."
sync_pages_dir

echo ""
echo "第 3 步：发布到 GitHub Pages 仓库..."
MESSAGE="更新 FOF 跟踪展示页数据 $(date '+%Y-%m-%d %H:%M')"
publish_pages_dir "$MESSAGE"

echo ""
echo "全部完成。"
echo "你现在可以把 GitHub Pages 链接发给其他人。"
pause_if_interactive
