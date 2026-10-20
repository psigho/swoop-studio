# Third-party software

Swoop Studio's original application code is MIT licensed; see `LICENSE` in the
source repository and `resources/LICENSE-Swoop.txt` in the installed app. This
does not relicense its third-party components.

## MP4 encoder: FFmpeg and x264

The Windows x64 app invokes a separate self-built `ffmpeg.exe` process for MP4
export. The build uses FFmpeg 6.1.6 and x264, with external dependency detection
and network protocols disabled. Swoop does not link those libraries into its
JavaScript application.

- Installed executable: `resources/encoder/ffmpeg.exe`.
- Encoder license: GPL version 3 or later, selected by the build's
  `--enable-gpl --enable-version3` configuration. x264 retains its GPL version 2
  or later license. Copyright belongs to their respective contributors.
- Full license texts: `resources/encoder/licenses/`; a compatibility copy of
  GPLv3 is also in `resources/third-party/ffmpeg-GPL-3.0.txt`.
- Exact binary/source hashes, configuration, toolchain and build instructions:
  `resources/encoder/manifest.json`, `build.sh` and `SOURCE.md`.
- Complete corresponding FFmpeg and x264 source archives, build recipe,
  signatures and notices: `vendor/ffmpeg/` in the public repository and
  `Swoop-Studio-Encoder-Source-0.2.5.zip` beside the installer on the release page.
- Upstream sources: [FFmpeg](https://ffmpeg.org/download.html) and
  [VideoLAN x264](https://code.videolan.org/videolan/x264).

This build replaces the broad prebuilt encoder used in earlier local candidates.
The source/build materials are supplied for this exact binary; a link to an
unrelated upstream release is not used as a substitute. GCC runtime-exception
and MinGW-w64 notices are included in the encoder license directory. General
purpose build tools and Windows system libraries are not bundled as sources.

## Native cursor capture: uiohook-napi and libuiohook

`uiohook-napi` 1.5.5 is MIT licensed. Its native module incorporates
`libuiohook`, copyright Alexander Barker and contributors, under LGPL version 3
or later. Both licenses apply; the wrapper's MIT license does not replace the
library's LGPL license.

The exact upstream npm source archive, integrity/hash receipt, full license
texts and rebuild/replacement instructions are in `vendor/uiohook/` and the
release's `Swoop-Studio-Native-Hook-Source-0.2.5.zip`. Installed copies of the
instructions, receipt and license texts are in
`resources/third-party/uiohook/`. The archive contains the native wrapper,
libuiohook C sources and headers, and the `binding.gyp` build description.

The Windows native module is unpacked at
`resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/win32-x64/uiohook-napi.node`.
Swoop imposes no restriction on private modification of the LGPL component or
reverse engineering needed to debug those modifications. See the source bundle's
instructions for rebuilding and replacing the module.

## App runtime, interface and fonts

Electron retains `LICENSE.electron.txt` and `LICENSES.chromium.html` in the
installation folder. Those notices cover Chromium and its bundled third-party
components. Electron's upstream source is available from
[electron/electron](https://github.com/electron/electron), with the runtime
version pinned in `package-lock.json`.

React, React DOM, Lucide, Manrope and the native wrapper's JavaScript dependencies
retain their copyright and license files in the packaged production dependencies.
Manrope uses the SIL Open Font License. The original playground demo is Swoop's
own export; it contains no Cursorful media or binaries.

Third-party free software is provided without warranty, subject to its included
license terms. Source bundles and checksums are available with the installer at
[the public releases](https://github.com/psigho/swoop-studio/releases).
