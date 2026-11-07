#!/usr/bin/env bash
# Builds src/library/fonts/book-mono.woff2 from JetBrains Mono 2.304 (OFL).
# Needs curl, unzip and pyftsubset (fontTools + brotli) on PATH.
set -euo pipefail

URL="https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/src/library/fonts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "$TMP/jbm.zip"
unzip -q "$TMP/jbm.zip" -d "$TMP/jbm"

SRC="$(find "$TMP/jbm" -path '*fonts/ttf/JetBrainsMono-Regular.ttf' | head -n1)"
LICENSE_FILE="$(find "$TMP/jbm" -iname 'OFL.txt' | head -n1)"
[ -n "$SRC" ] || { echo "JetBrainsMono-Regular.ttf not found in archive" >&2; exit 1; }

UNICODES="U+0020-007E,U+0400-045F,U+2013,U+2014,U+2022,U+2030,U+2190-2193,U+2248,U+2500-259F,U+25A0,U+25B2,U+25BA,U+25BC,U+25C4,U+25CF,U+03B1,U+00A0-00FF"

mkdir -p "$OUT_DIR"

# 1. subset to a plain TTF (no hinting, no layout tables)
pyftsubset "$SRC" \
  --unicodes="$UNICODES" \
  --layout-features='' \
  --no-hinting \
  --drop-tables+=GDEF,GPOS,GSUB,gasp \
  --output-file="$TMP/step1.ttf"

# 2. flatten composite glyphs: accented letters reference zero-width mark
#    components, which would otherwise stay in the font as non-600 glyphs
python3 - "$TMP/step1.ttf" "$TMP/step2.ttf" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
f = TTFont(sys.argv[1])
glyf, gs = f['glyf'], f.getGlyphSet()
for name in f.getGlyphOrder():
    if glyf[name].isComposite():
        rec = DecomposingRecordingPen(gs)
        gs[name].draw(rec)
        pen = TTGlyphPen(None)
        rec.replay(pen)
        glyf[name] = pen.glyph()
f.save(sys.argv[2])
PY

# 3. drop the now-unreferenced component glyphs and write woff2
pyftsubset "$TMP/step2.ttf" \
  --unicodes="$UNICODES" \
  --flavor=woff2 \
  --layout-features='' \
  --no-hinting \
  --output-file="$OUT_DIR/book-mono.woff2"

[ -z "$LICENSE_FILE" ] || cp "$LICENSE_FILE" "$OUT_DIR/OFL-JetBrainsMono.txt"
ls -l "$OUT_DIR/book-mono.woff2"
