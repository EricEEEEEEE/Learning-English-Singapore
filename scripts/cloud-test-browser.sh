#!/usr/bin/env bash
# 云端判卷用浏览器：下载与 tests/ 里 Playwright 版本完全对应的 Chrome for Testing（带 H.264 解码），
# 放进项目外的缓存目录，打印要 export 的 PLAYWRIGHT_BROWSERS_PATH。
# 云端自带的旧 Chromium 不支持 H.264，视频考题（T59/T60/T61B/T69/T70）在那上面必然失败。
# 用法: eval "$(bash scripts/cloud-test-browser.sh)"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${LES_BROWSER_CACHE:-$HOME/.cache/les-pw-browsers}"
INFO="$ROOT/tests/node_modules/playwright-core/browsers.json"
[ -f "$INFO" ] || { echo "先运行 npm --prefix tests ci" >&2; exit 1; }
read -r REV VER < <(node -e "const b=require(process.argv[1]).browsers.find(x=>x.name==='chromium');console.log(b.revision,b.browserVersion)" "$INFO")
fetch() { # fetch <zip名> <目标目录>
  local dir="$CACHE/$2"
  [ -f "$dir/INSTALLATION_COMPLETE" ] && return 0
  local tmp; tmp="$(mktemp -d)"
  curl -sSf -o "$tmp/$1.zip" "https://storage.googleapis.com/chrome-for-testing-public/$VER/linux64/$1.zip" >&2
  rm -rf "$dir" && mkdir -p "$dir"
  python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$tmp/$1.zip" "$dir"
  chmod -R u+x "$dir"
  touch "$dir/INSTALLATION_COMPLETE" "$dir/DEPENDENCIES_VALIDATED"
  rm -rf "$tmp"
}
fetch chrome-linux64 "chromium-$REV"
fetch chrome-headless-shell-linux64 "chromium_headless_shell-$REV"
echo "export PLAYWRIGHT_BROWSERS_PATH='$CACHE'"
