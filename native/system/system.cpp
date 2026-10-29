// Swoop Studio, MIT. Only device identities, focus geometry and requested
// audio.
#define _WIN32_WINNT 0x0A00
#include <audioclient.h>
#include <cstdint>
#include <cstdio>
#include <fcntl.h>
#include <functiondiscoverykeys_devpkey.h>
#include <io.h>
#include <mmdeviceapi.h>
#include <stdexcept>
#include <string>
#include <uiautomation.h>
#include <vector>
#include <windows.h>

template <class T> struct Ptr {
  T *p = nullptr;
  ~Ptr() {
    if (p)
      p->Release();
  }
  T **out() { return &p; }
  T *operator->() { return p; }
};
void check(HRESULT hr, const char *action) {
  if (FAILED(hr))
    throw std::runtime_error(std::string(action) + " (" +
                             std::to_string((unsigned long)hr) + ")");
}
std::string utf8(const wchar_t *s) {
  int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, nullptr, 0, nullptr, nullptr);
  std::string v(n, 0);
  WideCharToMultiByte(CP_UTF8, 0, s, -1, v.data(), n, nullptr, nullptr);
  v.pop_back();
  return v;
}
std::string json(const std::string &s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\')
      o += '\\';
    if (c < 32) {
      char b[7];
      snprintf(b, 7, "\\u%04x", c);
      o += b;
    } else
      o += c;
  }
  return o + '"';
}
Ptr<IMMDeviceEnumerator> *enumerator() {
  auto e = new Ptr<IMMDeviceEnumerator>();
  check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                         __uuidof(IMMDeviceEnumerator), (void **)e->out()),
        "Open audio devices");
  return e;
}
void outputs() {
  auto ep = enumerator();
  auto &e = *ep;
  Ptr<IMMDeviceCollection> devices;
  check(e->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, devices.out()),
        "List outputs");
  Ptr<IMMDevice> def;
  LPWSTR did = nullptr;
  if (SUCCEEDED(e->GetDefaultAudioEndpoint(eRender, eConsole, def.out())))
    def->GetId(&did);
  UINT count = 0;
  devices->GetCount(&count);
  printf("[");
  for (UINT i = 0; i < count; i++) {
    Ptr<IMMDevice> d;
    check(devices->Item(i, d.out()), "Read output");
    LPWSTR id = nullptr;
    check(d->GetId(&id), "Read output ID");
    Ptr<IPropertyStore> props;
    check(d->OpenPropertyStore(STGM_READ, props.out()), "Read output name");
    PROPVARIANT name;
    PropVariantInit(&name);
    props->GetValue(PKEY_Device_FriendlyName, &name);
    printf("%s{\"id\":%s,\"name\":%s,\"isDefault\":%s}", i ? "," : "",
           json(utf8(id)).c_str(),
           json(name.vt == VT_LPWSTR ? utf8(name.pwszVal) : "Audio output")
               .c_str(),
           did && wcscmp(id, did) == 0 ? "true" : "false");
    PropVariantClear(&name);
    CoTaskMemFree(id);
  }
  printf("]\n");
  CoTaskMemFree(did);
  delete ep;
}

void focus() {
  HWND fg = GetForegroundWindow();
  GUITHREADINFO info{sizeof(info)};
  POINT point{};
  bool found = false, password = false;
  // UI Automation reads properties and rectangles only. Never request
  // text/value.
  Ptr<IUIAutomation> ui;
  Ptr<IUIAutomationElement> element;
  if (SUCCEEDED(CoCreateInstance(__uuidof(CUIAutomation), nullptr,
                                 CLSCTX_INPROC_SERVER, __uuidof(IUIAutomation),
                                 (void **)ui.out())) &&
      SUCCEEDED(ui->GetFocusedElement(element.out())) && element.p) {
    BOOL secret = FALSE;
    password = FAILED(element->get_CurrentIsPassword(&secret)) || secret;
    if (!password) {
      Ptr<IUIAutomationTextPattern2> pattern;
      if (SUCCEEDED(element->GetCurrentPatternAs(
              UIA_TextPattern2Id, __uuidof(IUIAutomationTextPattern2),
              (void **)pattern.out())) &&
          pattern.p) {
        BOOL active = FALSE;
        Ptr<IUIAutomationTextRange> range;
        if (SUCCEEDED(pattern->GetCaretRange(&active, range.out())) && active &&
            range.p) {
          SAFEARRAY *rectangles = nullptr;
          if (SUCCEEDED(range->GetBoundingRectangles(&rectangles)) &&
              rectangles) {
            double *v = nullptr;
            LONG lo = 0, hi = -1;
            SafeArrayGetLBound(rectangles, 1, &lo);
            SafeArrayGetUBound(rectangles, 1, &hi);
            if (hi - lo >= 3 &&
                SUCCEEDED(SafeArrayAccessData(rectangles, (void **)&v))) {
              point = {(LONG)(v[0] + v[2] / 2), (LONG)(v[1] + v[3] / 2)};
              found = true;
              SafeArrayUnaccessData(rectangles);
            }
            SafeArrayDestroy(rectangles);
          }
        }
      }
      if (!found) {
        BOOL editable = FALSE;
        element->get_CurrentIsKeyboardFocusable(&editable);
        CONTROLTYPEID type = 0;
        element->get_CurrentControlType(&type);
        RECT r{};
        if (editable && type == UIA_EditControlTypeId &&
            SUCCEEDED(element->get_CurrentBoundingRectangle(&r)) &&
            r.right > r.left && r.bottom > r.top) {
          // Without a caret rectangle, frame the text's leading edge. Centering
          // a wide editor can crop away the line the user is typing.
          point = {r.left + std::min(28L, (r.right - r.left) / 4),
                   r.top + std::min(28L, (r.bottom - r.top) / 4)};
          found = true;
        }
      }
    }
  }
  if (!password && !found && GetGUIThreadInfo(0, &info) && info.hwndCaret) {
    point = {info.rcCaret.left, (info.rcCaret.top + info.rcCaret.bottom) / 2};
    found = ClientToScreen(info.hwndCaret, &point);
  }
  // Reject a result that raced a focus switch while UI Automation was querying.
  if (GetForegroundWindow() != fg) {
    found = false;
    password = true;
  }
  RECT windowRect{};
  GetWindowRect(fg, &windowRect);
  printf("{\"window\":\"%llu\",\"found\":%s,\"password\":%s,\"x\":%ld,\"y\":%"
         "ld,\"windowX\":%ld,\"windowY\":%ld}\n",
         (unsigned long long)(uintptr_t)fg, found ? "true" : "false",
         password ? "true" : "false", point.x, point.y,
         (windowRect.left + windowRect.right) / 2,
         (windowRect.top + windowRect.bottom) / 2);
}
void write(const void *bytes, size_t size) {
  if (fwrite(bytes, 1, size, stdout) != size || fflush(stdout))
    throw std::runtime_error("Audio pipe closed");
}
void loopback(const wchar_t *id, DWORD parent) {
  auto ep = enumerator();
  Ptr<IMMDevice> device;
  if (wcscmp(id, L"default") == 0)
    check((*ep)->GetDefaultAudioEndpoint(eRender, eConsole, device.out()),
          "Find default output");
  else
    check((*ep)->GetDevice(id, device.out()), "Find selected output");
  delete ep;
  DWORD state = 0;
  check(device->GetState(&state), "Read output state");
  if (state != DEVICE_STATE_ACTIVE)
    throw std::runtime_error("Selected output is disconnected");
  Ptr<IAudioClient> client;
  check(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                         (void **)client.out()),
        "Open selected output");
  WAVEFORMATEX format{};
  format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  format.nChannels = 2;
  format.nSamplesPerSec = 48000;
  format.wBitsPerSample = 32;
  format.nBlockAlign = 8;
  format.nAvgBytesPerSec = 384000;
  check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                           AUDCLNT_STREAMFLAGS_LOOPBACK |
                               AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                               AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                           1000000, 0, &format, nullptr),
        "Start selected output loopback");
  Ptr<IAudioCaptureClient> capture;
  check(
      client->GetService(__uuidof(IAudioCaptureClient), (void **)capture.out()),
      "Open loopback buffer");
  HANDLE owner = OpenProcess(SYNCHRONIZE, FALSE, parent);
  if (!owner)
    throw std::runtime_error("Recorder process is unavailable");
  _setmode(_fileno(stdout), _O_BINARY);
  uint32_t header[] = {0x31304153, 48000, 2};
  write(header, sizeof(header));
  check(client->Start(), "Start audio clock");
  while (WaitForSingleObject(owner, 5) == WAIT_TIMEOUT) {
    UINT32 frames = 0;
    check(capture->GetNextPacketSize(&frames), "Read selected output");
    while (frames) {
      BYTE *bytes = nullptr;
      DWORD flags = 0;
      check(capture->GetBuffer(&bytes, &frames, &flags, nullptr, nullptr),
            "Read loopback samples");
      if (frames > 16384)
        throw std::runtime_error("Audio packet is too large");
      uint32_t size = frames * 8;
      write(&size, 4);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::vector<BYTE> silence(size, 0);
        write(silence.data(), size);
      } else
        write(bytes, size);
      check(capture->ReleaseBuffer(frames), "Release loopback buffer");
      check(capture->GetNextPacketSize(&frames), "Read next audio packet");
    }
  }
  client->Stop();
  CloseHandle(owner);
}
int wmain(int argc, wchar_t **argv) {
  try {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    check(CoInitializeEx(nullptr, COINIT_MULTITHREADED),
          "Initialize Windows services");
    if (argc == 2 && wcscmp(argv[1], L"--outputs") == 0)
      outputs();
    else if (argc == 2 && wcscmp(argv[1], L"--focus") == 0)
      focus();
    else if (argc == 2 && wcscmp(argv[1], L"--check") == 0) {
      auto e = enumerator();
      delete e;
      puts("{\"ok\":true}");
    } else if (argc == 5 && wcscmp(argv[1], L"--loopback") == 0 &&
               wcscmp(argv[3], L"--parent") == 0)
      loopback(argv[2], wcstoul(argv[4], nullptr, 10));
    else
      throw std::runtime_error("Invalid Swoop system helper request");
    CoUninitialize();
    return 0;
  } catch (const std::exception &e) {
    fprintf(stderr, "%s\n", e.what());
    return 1;
  }
}
