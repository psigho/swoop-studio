#!/usr/bin/env bash
set -euo pipefail
export PATH=/ucrt64/bin:/usr/bin
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HERE/win32-x64"
g++ -std=c++17 -O2 -s -static -static-libgcc -static-libstdc++ \
  "$HERE/capture.cpp" -o "$HERE/win32-x64/SwoopCapture.exe" \
  -ld3d11 -ldxgi -lruntimeobject -lole32 -loleaut32 -lwindowscodecs -luuid
objdump -p "$HERE/win32-x64/SwoopCapture.exe" | sed -n '/DLL Name:/p' > "$HERE/imports.txt"
