# Native pointer hook: source, licenses, and replacement

Swoop Studio 0.2.5 for Windows x64 uses the unmodified `uiohook-napi` 1.5.5
prebuilt native module. Its C/JavaScript wrapper is MIT licensed; its statically
linked **libuiohook** library is **LGPL-3.0-or-later**. Swoop's MIT license does
not change those library terms. Read the included `MIT.txt`, `LGPL-3.0.txt`, and
`GPL-3.0.txt`; LGPL version 3 supplements GPL version 3.

## Source included with this release

`uiohook-napi-1.5.5.tgz` is the complete, unmodified npm release archive, not
just a link to upstream. It contains the native wrapper C sources in
`package/src/lib/`, libuiohook C sources and headers in
`package/libuiohook/{src,include}/`, `package/binding.gyp` (the build and static
link instructions), the JavaScript wrapper, and upstream prebuilt modules.
The Windows build references only those included project files plus standard
C/Windows SDK and Electron/Node development headers.

The archive contains the release's already-patched libuiohook source; no
separate patch application or libuiohook submodule checkout is necessary.
Swoop makes no source changes to the native package. All 40 files extracted
from the archive matched the installed npm package byte for byte. The archive's
Windows x64 prebuild also matches the native module packaged with Swoop.

| Material | Identity |
| --- | --- |
| Registry archive | <https://registry.npmjs.org/uiohook-napi/-/uiohook-napi-1.5.5.tgz> |
| Archive SHA-256 | `21b489ee141e5d2e82ec595510e8b7dd6c2d9c91266f4094be3bfe04e0a33acd` |
| Native Windows x64 SHA-256 | `ee68f046628d2e4406d8aa85c6489ad06578b64a0e19ed64822bd22e7c473b85` |
| Package metadata | <https://registry.npmjs.org/uiohook-napi/1.5.5> |
| Wrapper upstream | <https://github.com/SnosMe/uiohook-napi> |
| Library upstream | <https://github.com/kwhat/libuiohook> |

`manifest.json` records the npm integrity value, per-file hashes, and license
origins. The registry does not publish a `gitHead` for this package version;
none is inferred. The immutable archive and verified hashes identify the
source/prebuild release used here. This is not a claim that a local rebuild
will reproduce the original upstream binary bit for bit.

## Build a modified Windows x64 module

Use a separate writable working directory and keep your application closed
while replacing its module. You need Windows x64, a supported Node.js release,
Python, and Visual Studio Build Tools with the C++ workload and Windows SDK.
These are development tools, not Swoop end-user dependencies. The example uses
`node-gyp` 13.1.0, which requires Node `^22.22.2`, `^24.15.0`, or `>=26.0.0`.
The tool downloads Electron 44.7.2 development headers (including Node-API and
libuv headers) from Electron's official header service.

From a PowerShell session in this directory, using a new empty build directory:

```powershell
New-Item -ItemType Directory -Path K:\swoop-hook-build
tar -xzf .\uiohook-napi-1.5.5.tgz -C K:\swoop-hook-build
Set-Location K:\swoop-hook-build\package
# Edit libuiohook/src, libuiohook/include, or src/lib as desired.
npm exec --yes --package=node-gyp@13.1.0 -- node-gyp rebuild --target=44.7.2 --arch=x64 --dist-url=https://electronjs.org/headers --devdir=K:\swoop-hook-build\electron-headers
```

The native output is `build\Release\uiohook_napi.node`. `binding.gyp` rebuilds
the static libuiohook target and links it into that module, so rebuilding the
entire module incorporates a modified library. No proprietary object files,
signing key, activation, or upstream prebuild service is required by Swoop to
replace this module. The original archive is sufficient for the C targets;
the upstream TypeScript demo and prebuild-release tooling are not needed for
this native rebuild. A local rebuild was **not** performed as part of the
release verification.

## Use the modified module

With Swoop closed, back up and replace this file below your chosen installed
application folder (or a writable copy of `win-unpacked`):

```text
resources\app.asar.unpacked\node_modules\uiohook-napi\prebuilds\win32-x64\uiohook-napi.node
```

For example, after setting `$swoopFolder` to your application folder:

```powershell
$hookFile = Join-Path $swoopFolder 'resources\app.asar.unpacked\node_modules\uiohook-napi\prebuilds\win32-x64\uiohook-napi.node'
Copy-Item -LiteralPath $hookFile -Destination ($hookFile + '.original')
Copy-Item -LiteralPath 'K:\swoop-hook-build\package\build\Release\uiohook_napi.node' -Destination $hookFile
```

The native module is outside `app.asar`; Swoop does not require its original
hash or a Swoop signature to load it. Restart Swoop, run its dependency check,
and test pointer recording. For development from Swoop's source, place the same
file at `node_modules\uiohook-napi\prebuilds\win32-x64\uiohook-napi.node`;
an npm reinstall may replace it. Preserve your modified sources and any build
instructions if redistributing your modified version.

Swoop imposes no restriction on private modifications or reverse engineering
for debugging modifications to the LGPL library. The full application source
is supplied under MIT, and this directory supplies the native package source,
build instructions, and licenses. The licenses describe your redistribution
rights and obligations.

Build references: [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules),
[node-gyp Windows prerequisites](https://github.com/nodejs/node-gyp#on-windows).
License originals: [LGPL 3](https://www.gnu.org/licenses/lgpl-3.0.txt),
[GPL 3](https://www.gnu.org/licenses/gpl-3.0.txt).
