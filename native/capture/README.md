# SwoopCapture

Original MIT-licensed Windows capture helper. It uses Windows Graphics Capture,
D3D11 and the Windows Imaging Component. It selects only the exact HWND or
display rectangle passed by Swoop's trusted recording setup. It explicitly sets
`IGraphicsCaptureSession2.IsCursorCaptureEnabled` to false and writes JPEG frames
to stdout. It never changes or hides the user's system cursor.

Requires Windows 10 version 2004 (build 19041) or later, or Windows 11, on x64.
Protected content is excluded by Windows. Minimized/closed sources and size
changes stop the take. Keep a window in place for the editable pointer track.

Build in MSYS2 UCRT64 with GCC, the MinGW-w64 headers, and binutils:

```sh
bash native/capture/build.sh
```

`capture.cpp` is the complete helper source. `build.sh` is the build recipe,
`imports.txt` lists Windows DLL imports, and `manifest.json` records source,
recipe and shipped executable hashes. No .NET or Visual C++ redistributable is
required. GCC C++/support runtimes are linked statically under the GCC Runtime
Library Exception; the accompanying app's `encoder/licenses/` contains the GCC,
exception and MinGW-w64 notices. Swoop's root MIT license applies to this helper.

`SwoopCapture.exe --check` checks Windows capture API/graphics support without
capturing anything. The private `--cursor-control` option enables the OS cursor
only for an owned positive-control test; the app never passes that option.
