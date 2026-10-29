#!/usr/bin/env bash
set -euo pipefail
export PATH=/ucrt64/bin:/usr/bin
cd "$(dirname "$0")"
mkdir -p win32-x64
g++ -std=c++17 -O2 -s -static -static-libgcc -static-libstdc++ -municode system.cpp -o win32-x64/SwoopSystem.exe -lole32 -loleaut32 -luuid
objdump -p win32-x64/SwoopSystem.exe | sed -n 's/.*DLL Name: /DLL Name: /p' > imports.txt
sha256sum system.cpp | cut -d ' ' -f 1 > source.sha256
