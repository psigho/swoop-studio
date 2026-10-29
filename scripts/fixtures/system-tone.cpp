// Original test fixture: a quiet owned tone on one exact Windows endpoint.
#include <audioclient.h>
#include <cmath>
#include <cstdio>
#include <mmdeviceapi.h>
#include <windows.h>
int wmain(int argc, wchar_t **argv) {
  if (argc != 2)
    return 2;
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  IMMDeviceEnumerator *e = nullptr;
  IMMDevice *d = nullptr;
  IAudioClient *c = nullptr;
  IAudioRenderClient *r = nullptr;
  auto check = [](HRESULT hr) {
    if (FAILED(hr)) {
      fprintf(stderr, "Tone fixture failed: %lx\n", (unsigned long)hr);
      ExitProcess(1);
    }
  };
  check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                         __uuidof(IMMDeviceEnumerator), (void **)&e));
  check(e->GetDevice(argv[1], &d));
  check(d->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void **)&c));
  WAVEFORMATEX f{};
  f.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  f.nChannels = 2;
  f.nSamplesPerSec = 48000;
  f.wBitsPerSample = 32;
  f.nBlockAlign = 8;
  f.nAvgBytesPerSec = 384000;
  check(c->Initialize(AUDCLNT_SHAREMODE_SHARED,
                      AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                          AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                      1000000, 0, &f, nullptr));
  check(c->GetService(__uuidof(IAudioRenderClient), (void **)&r));
  UINT32 capacity = 0;
  c->GetBufferSize(&capacity);
  check(c->Start());
  unsigned long long sample = 0;
  ULONGLONG start = GetTickCount64();
  while (GetTickCount64() - start < 3000) {
    UINT32 padding = 0;
    check(c->GetCurrentPadding(&padding));
    UINT32 frames = capacity - padding;
    if (frames) {
      BYTE *data = nullptr;
      check(r->GetBuffer(frames, &data));
      float *pcm = (float *)data;
      for (UINT32 i = 0; i < frames; i++, sample++) {
        float v = .02f * sin(6.283185307179586 * 997 * sample / 48000);
        pcm[i * 2] = v;
        pcm[i * 2 + 1] = v;
      }
      check(r->ReleaseBuffer(frames, 0));
    }
    Sleep(5);
  }
  Sleep(100);
  c->Stop();
  r->Release();
  c->Release();
  d->Release();
  e->Release();
  CoUninitialize();
  return 0;
}
