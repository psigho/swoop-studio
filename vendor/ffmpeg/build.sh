#!/usr/bin/env bash
# Build from the adjacent complete source archives using MSYS2 UCRT64.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:?Usage: bash build.sh /k/_tools/swoop-encoder-work}"
case "$ROOT" in *[[:space:]]*) echo 'Choose a work directory without spaces; the source checkout may contain spaces.' >&2; exit 2;; esac
export PATH=/ucrt64/bin:/usr/bin
export PKG_CONFIG_PATH="$ROOT/prefix/lib/pkgconfig"
export TMPDIR="$ROOT/tmp"
unset FFMPEG_BIN UIOHOOK_NAPI_PREBUILD
mkdir -p "$ROOT/work" "$ROOT/prefix" "$ROOT/tmp" "$HERE/win32-x64" "$HERE/metadata"
cd "$HERE"
printf '%s  %s\n' \
  d4fcb164028dd3beee5d92c0ac72e46aac6973c75ea12dc14de07bf8f407370a source/ffmpeg-6.1.6.tar.xz \
  cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9 source/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz | sha256sum -c -
tar -xJf "$HERE/source/ffmpeg-6.1.6.tar.xz" -C "$ROOT/work"
tar -xzf "$HERE/source/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz" -C "$ROOT/work"
pacman -Q > "$HERE/metadata/toolchain-packages.txt"
gcc -v > "$HERE/metadata/compiler.txt" 2>&1
nasm -v >> "$HERE/metadata/compiler.txt"
cd "$ROOT/work/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55"
./configure --prefix="$ROOT/prefix" --host=x86_64-w64-mingw32 \
  --enable-static --disable-cli --disable-opencl \
  --extra-cflags=-O2 --extra-ldflags='-static -static-libgcc'
make -j8
make install
cp config.log "$HERE/metadata/x264-config.log"
cp config.mak "$HERE/metadata/x264-config.mak"
cd "$ROOT/work/ffmpeg-6.1.6"
./configure --prefix="$ROOT/prefix" --target-os=mingw32 --arch=x86_64 \
  --enable-gpl --enable-version3 --enable-libx264 \
  --enable-static --disable-shared --disable-autodetect --disable-network \
  --disable-debug --disable-doc --disable-ffplay --disable-ffprobe \
  --disable-devices --enable-indev=lavfi \
  --disable-encoders --enable-encoder=libx264,aac,pcm_s16le,wrapped_avframe \
  --disable-decoders --enable-decoder=h264,aac,opus,vp8,vp9,vorbis,pcm_s16le,rawvideo,wrapped_avframe \
  --disable-muxers --enable-muxer=mp4,null,matroska,webm,wav \
  --disable-demuxers --enable-demuxer=matroska,mov,wav \
  --disable-protocols --enable-protocol=file,pipe \
  --disable-bsfs --enable-bsf=aac_adtstoasc,h264_mp4toannexb \
  --pkg-config-flags=--static --extra-cflags=-O2 --extra-ldflags='-static -static-libgcc'
make -j8
cp ffmpeg.exe "$HERE/win32-x64/ffmpeg.exe"
cp config.h "$HERE/metadata/ffmpeg-config.h"
cp ffbuild/config.mak "$HERE/metadata/ffmpeg-config.mak"
cp ffbuild/config.log "$HERE/metadata/ffmpeg-config.log"
"$HERE/win32-x64/ffmpeg.exe" -hide_banner -version > "$HERE/metadata/version.txt" 2>&1
"$HERE/win32-x64/ffmpeg.exe" -hide_banner -buildconf > "$HERE/metadata/buildconf.txt" 2>&1
objdump -p "$HERE/win32-x64/ffmpeg.exe" | sed -n '/DLL Name:/p' > "$HERE/metadata/imports.txt"
sha256sum "$HERE/win32-x64/ffmpeg.exe" > "$HERE/metadata/binary-sha256.txt"
