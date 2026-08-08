#!/bin/bash
# Hollowtree trailer — contact sheet from a directory tree of PNG stills.
# Usage: ./contact-sheet.sh <src-dir> <out.png> [cols] [tile-width]
set -euo pipefail
SRC="${1:?src dir}"
OUT="${2:?out png}"
COLS="${3:-5}"
TW="${4:-480}"
TH=$(( TW * 9 / 16 ))

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

i=0
while IFS= read -r f; do
  printf -v n "%04d" "$i"
  cp "$f" "$TMP/$n.png"
  i=$((i+1))
done < <(find "$SRC" -name '*.png' | sort)

COUNT=$i
ROWS=$(( (COUNT + COLS - 1) / COLS ))
echo "$COUNT frames -> ${COLS}x${ROWS}"

/usr/local/bin/ffmpeg -y -loglevel error -framerate 1 -i "$TMP/%04d.png" \
  -frames:v 1 -vf "scale=${TW}:${TH},tile=${COLS}x${ROWS}:padding=4:margin=6:color=0x141414" \
  "$OUT"
echo "wrote $OUT"
