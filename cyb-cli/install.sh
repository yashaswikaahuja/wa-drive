#!/usr/bin/env bash
# Install CyberControl CLI (`cyb`)
#   curl -fsSL https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/debug/cc-cli/cyb-cli/install.sh | bash
set -euo pipefail

REPO="${CYB_REPO:-https://github.com/yashaswikaahuja/wa-drive.git}"
BRANCH="${CYB_BRANCH:-debug/cc-cli}"
PREFIX="${CYB_PREFIX:-$HOME/.cybercontrol}"
BIN_DIR="${CYB_BIN_DIR:-$HOME/.local/bin}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "error: need $1 installed" >&2; exit 1; }
}

need git
need node
need npm

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: Node.js 18+ required (found $(node -v))" >&2
  exit 1
fi

echo "==> CyberControl CLI install"
echo "    repo=$REPO branch=$BRANCH"
echo "    prefix=$PREFIX"

rm -rf "$PREFIX/src"
mkdir -p "$PREFIX" "$BIN_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$PREFIX/src" 2>/dev/null \
  || git clone --depth 1 "$REPO" "$PREFIX/src"

# Prefer package from clone path cyb-cli/
PKG="$PREFIX/src/cyb-cli"
if [ ! -f "$PKG/package.json" ]; then
  echo "error: cyb-cli/ not found on branch $BRANCH" >&2
  exit 1
fi

# Install package files into prefix
rm -rf "$PREFIX/cli"
mkdir -p "$PREFIX/cli"
cp -R "$PKG/." "$PREFIX/cli/"
chmod +x "$PREFIX/cli/bin/cyb.js"

# Global-style link via npm (user prefix)
npm install -g --prefix "$PREFIX/npm" "$PREFIX/cli" >/dev/null 2>&1 \
  || npm install -g "$PREFIX/cli"

# Ensure cyb on PATH
if command -v cyb >/dev/null 2>&1; then
  echo "==> cyb already on PATH: $(command -v cyb)"
else
  # symlink into BIN_DIR from npm global bin or direct
  NPM_BIN="$PREFIX/npm/bin/cyb"
  if [ -x "$NPM_BIN" ]; then
    ln -sfn "$NPM_BIN" "$BIN_DIR/cyb"
  else
    ln -sfn "$PREFIX/cli/bin/cyb.js" "$BIN_DIR/cyb"
  fi
  echo "==> Linked $BIN_DIR/cyb"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      echo ""
      echo "Add to your shell profile:"
      echo "  export PATH=\"$BIN_DIR:\$PATH\""
      ;;
  esac
fi

# Cleanup bulky clone if install succeeded (keep cli copy)
rm -rf "$PREFIX/src"

echo ""
echo "✓ Installed cyb $(node "$PREFIX/cli/bin/cyb.js" version 2>/dev/null || echo '')"
echo ""
echo "Next:"
echo "  cyb login          # opens browser to authorize"
echo "  cyb whoami"
echo "  cyb sessions"
echo "  cyb live"
