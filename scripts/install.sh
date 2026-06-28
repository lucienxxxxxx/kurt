#!/bin/sh
set -eu

REPO="${KURT_REPO:-lucienxxxxxx/kurt}"
VERSION="${KURT_VERSION:-latest}"
INSTALL_DIR="${KURT_INSTALL_DIR:-$HOME/.local/bin}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "kurt install: missing required command: $1" >&2
    exit 1
  }
}

need uname
need curl

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux) PLATFORM="linux" ;;
  *) echo "kurt install: unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  arm64|aarch64) CPU="arm64" ;;
  x86_64|amd64) CPU="x64" ;;
  *) echo "kurt install: unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ASSET="kurt-$PLATFORM-$CPU"
BASE="https://github.com/$REPO/releases"
if [ "$VERSION" = "latest" ]; then
  URL="$BASE/latest/download/$ASSET"
else
  URL="$BASE/download/$VERSION/$ASSET"
fi

mkdir -p "$INSTALL_DIR"
TMP="$(mktemp "${TMPDIR:-/tmp}/kurt.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

echo "Downloading $ASSET from $URL"
curl -fsSL "$URL" -o "$TMP"
chmod +x "$TMP"
mv "$TMP" "$INSTALL_DIR/kurt"

echo "Installed kurt to $INSTALL_DIR/kurt"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "Add this to your shell profile if kurt is not found:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo ""
"$INSTALL_DIR/kurt" help | sed -n '1,12p'
