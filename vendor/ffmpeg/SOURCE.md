# Swoop Studio Windows encoder source

This directory contains the complete source archives used for Swoop's separate
FFmpeg executable, its build recipe, copyright/license texts and build records.
The JavaScript application invokes this executable as a separate process.

## Exact inputs

- FFmpeg 6.1.6, unmodified official release source:
  https://ffmpeg.org/releases/ffmpeg-6.1.6.tar.xz
  SHA-256 `d4fcb164028dd3beee5d92c0ac72e46aac6973c75ea12dc14de07bf8f407370a`.
- x264, unmodified VideoLAN stable commit
  `b35605ace3ddf7c1a5d67a2eb553f034aef41d55`:
  https://code.videolan.org/videolan/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz
  SHA-256 `cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9`.

The complete archives are in `source/`, not downloaded by the build recipe.
There are no source patches. FFmpeg's detached release signature and the key
downloaded from https://ffmpeg.org/ffmpeg-devel.asc are included. Verification
on 2026-10-21 reported a good signature from release-key fingerprint
`FCF986EA15E6E293A5644F10B4322F04D67658D8`; the record is in `metadata/`.
x264's archive was fetched over HTTPS from VideoLAN and pinned by SHA-256.

## Building a modified or original encoder

Use Windows x64 with MSYS2 UCRT64. The original build used MSYS2 GCC
`16.2.0-6`, binutils `2.47-4`, mingw-w64 CRT and headers
`14.0.0.r426.g4564ee4b5-1`, make `4.4.1-3`, NASM `3.02-1` and pkgconf
`1~3.0.8-1`. `metadata/toolchain-packages.txt` and `metadata/compiler.txt`
record the installed package/compiler versions. The tools are build prerequisites,
not additional applications required by Swoop users.

In an MSYS2 UCRT64 shell, install the compiler and helpers if absent:

```sh
pacman -S --needed mingw-w64-ucrt-x86_64-gcc make nasm mingw-w64-ucrt-x86_64-pkgconf
bash '/k/path with spaces/swoop-studio/vendor/ffmpeg/build.sh' /k/_tools/swoop-encoder-work
```

Choose an empty work directory without spaces for upstream Makefile paths. The
checkout containing this directory can have spaces. The recipe verifies both
source hashes, extracts the sources to that work directory, builds static x264
and FFmpeg, and writes `win32-x64/ffmpeg.exe` and fresh `metadata/` records here.
To modify the encoder, change the archive and corresponding hash in `build.sh`.
No byte-identical reproduction across different toolchain versions or work paths
is claimed. `manifest.json` records the exact shipped binary and source hashes.

## Configuration and licenses

The build disables FFmpeg automatic external-library detection, network access,
shared libraries, ffplay and ffprobe. x264 is its only external codec library.
It supports Swoop's H.264/AAC MP4 export; VP8/VP9/Opus WebM and H.264/AAC MP4
input; and the local test sources/filters used by dependency diagnostics.
The exact configure commands are in `build.sh` and `metadata/buildconf.txt`.

The combined encoder is distributed under GNU GPL version 3 or later. FFmpeg
and x264 copyright statements and full component licenses are retained in their
source archives; the main licenses are also in `licenses/`. FFmpeg is a trademark
of Fabrice Bellard. Swoop does not claim ownership of FFmpeg or x264.

Compiler runtime support is statically linked under the GCC Runtime Library
Exception 3.1; its license and exception are included. MinGW-w64 runtime/header
copyright and permission notices are included. Native Win32 threads are used;
the shipped executable's DLL imports are recorded in `metadata/imports.txt`.
No MSYS2, libgcc, libstdc++ or libwinpthread DLL is required alongside the app.

This software is distributed without warranty. Recipients may copy, modify and
redistribute the encoder according to its accompanying licenses. The Swoop
release includes this full directory and a corresponding-source release archive
so the sources and build materials accompany its installer.
