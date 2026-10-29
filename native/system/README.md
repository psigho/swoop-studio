# Swoop system helper

Original MIT source for Windows output device selection, WASAPI loopback and
typing focus geometry. Built statically with MSYS2 UCRT64 GCC. Only Windows
system DLLs are needed. Run `build.sh` to rebuild.

`--outputs` lists active playback endpoints without changing Windows defaults.
`--focus` returns focused caret/field geometry and foreground HWND, never text.
Password fields are excluded. Clients must verify focus belongs to their source.
`--loopback ID --parent PID` records only the selected endpoint. Its stdout is
binary: SA01, uint32 sample rate (48000), uint32 channels (2), then repeated
uint32 byte length and interleaved float32 stereo samples. All integers are
little endian. Capture exits when its parent exits. The app also kills the
helper on stop, failure and renderer shutdown.

No keystrokes, screen images or audio are written by this helper.
