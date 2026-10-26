// Copyright (c) 2026 Junaid Y. Sheikh. SPDX-License-Identifier: MIT
// Windows Graphics Capture -> bounded JPEG stdout; no global cursor changes.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <roapi.h>
#include <winstring.h>
#include <windows.graphics.capture.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <d3d11.h>
#include <wincodec.h>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <stdexcept>
#include <vector>

namespace Capture = ABI::Windows::Graphics::Capture;
namespace Direct3D = ABI::Windows::Graphics::DirectX::Direct3D11;
using Size = ABI::Windows::Graphics::SizeInt32;

template<class T> struct Ptr {
  T* p = nullptr;
  ~Ptr() { if (p) p->Release(); }
  T** out() { if (p) { p->Release(); p = nullptr; } return &p; }
  void** address() { return reinterpret_cast<void**>(out()); }
  T* operator->() const { return p; }
  operator T*() const { return p; }
  Ptr() = default; Ptr(const Ptr&) = delete; Ptr& operator=(const Ptr&) = delete;
};
void check(HRESULT hr, const char* action) {
  if (FAILED(hr)) {
    char detail[300]; std::snprintf(detail, sizeof(detail), "%s (Windows error 0x%08lx)", action, static_cast<unsigned long>(hr));
    throw std::runtime_error(detail);
  }
}
template<class T> void factory(const wchar_t* name, Ptr<T>& result) {
  HSTRING text = nullptr;
  check(WindowsCreateString(name, static_cast<UINT32>(wcslen(name)), &text), "Create Windows runtime class name");
  HRESULT hr = RoGetActivationFactory(text, __uuidof(T), result.address());
  WindowsDeleteString(text); check(hr, "Load Windows capture API; Windows 10 version 2004 or later is required");
}
void closeInspectable(IUnknown* object) {
  Ptr<ABI::Windows::Foundation::IClosable> closable;
  if (object && SUCCEEDED(object->QueryInterface(__uuidof(ABI::Windows::Foundation::IClosable), closable.address()))) closable->Close();
}
long long integer(const char* value) {
  char* end = nullptr; errno = 0; long long result = std::strtoll(value, &end, 10);
  if (errno || !end || !*value || *end) throw std::runtime_error("Invalid capture target.");
  return result;
}

struct Graphics {
  Ptr<ID3D11Device> device;
  Ptr<ID3D11DeviceContext> context;
  Ptr<Direct3D::IDirect3DDevice> runtime;
  Graphics() {
    HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, device.out(), nullptr, context.out());
    if (FAILED(hr)) hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, device.out(), nullptr, context.out());
    check(hr, "Create the recording graphics device");
    Ptr<IDXGIDevice> dxgi; check(device->QueryInterface(__uuidof(IDXGIDevice), dxgi.address()), "Read graphics device");
    Ptr<IInspectable> inspectable; check(CreateDirect3D11DeviceFromDXGIDevice(dxgi, inspectable.out()), "Create Windows recording device");
    check(inspectable->QueryInterface(__uuidof(Direct3D::IDirect3DDevice), runtime.address()), "Read Windows recording device");
  }
};

std::vector<unsigned char> jpeg(IWICImagingFactory* wic, UINT width, UINT height, BYTE* pixels, UINT stride) {
  Ptr<IWICBitmap> bitmap;
  check(wic->CreateBitmapFromMemory(width, height, GUID_WICPixelFormat32bppBGRA, stride, stride * height, pixels, bitmap.out()), "Read recording pixels");
  Ptr<IWICFormatConverter> converter; check(wic->CreateFormatConverter(converter.out()), "Create recording color converter");
  check(converter->Initialize(bitmap, GUID_WICPixelFormat24bppBGR, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom), "Convert recording colors");
  Ptr<IStream> stream; check(CreateStreamOnHGlobal(nullptr, TRUE, stream.out()), "Create recording frame stream");
  Ptr<IWICBitmapEncoder> encoder; check(wic->CreateEncoder(GUID_ContainerFormatJpeg, nullptr, encoder.out()), "Create recording frame encoder");
  check(encoder->Initialize(stream, WICBitmapEncoderNoCache), "Initialize recording frame encoder");
  Ptr<IWICBitmapFrameEncode> frame; Ptr<IPropertyBag2> properties;
  check(encoder->CreateNewFrame(frame.out(), properties.out()), "Create recording frame");
  PROPBAG2 property{}; property.pstrName = const_cast<wchar_t*>(L"ImageQuality");
  VARIANT quality{}; quality.vt = VT_R4; quality.fltVal = 0.96f;
  check(properties->Write(1, &property, &quality), "Set recording frame quality");
  check(frame->Initialize(properties), "Initialize recording frame");
  check(frame->SetSize(width, height), "Set recording frame size");
  WICPixelFormatGUID format = GUID_WICPixelFormat24bppBGR;
  check(frame->SetPixelFormat(&format), "Set recording frame colors");
  check(frame->WriteSource(converter, nullptr), "Encode recording frame");
  check(frame->Commit(), "Finish recording frame"); check(encoder->Commit(), "Finish recording image");
  STATSTG stat{}; check(stream->Stat(&stat, STATFLAG_NONAME), "Read recording frame size");
  if (!stat.cbSize.QuadPart || stat.cbSize.QuadPart > 32 * 1024 * 1024) throw std::runtime_error("Recording frame exceeded its size limit.");
  std::vector<unsigned char> bytes(static_cast<size_t>(stat.cbSize.QuadPart));
  LARGE_INTEGER zero{}; check(stream->Seek(zero, STREAM_SEEK_SET, nullptr), "Rewind recording frame");
  ULONG read = 0; check(stream->Read(bytes.data(), static_cast<ULONG>(bytes.size()), &read), "Read encoded recording frame");
  if (read != bytes.size()) throw std::runtime_error("Incomplete recording frame.");
  return bytes;
}

int main(int argc, char** argv) {
  try {
    OSVERSIONINFOW version{}; version.dwOSVersionInfoSize = sizeof(version);
    using VersionFunction = LONG(WINAPI*)(OSVERSIONINFOW*);
    auto getVersion = reinterpret_cast<VersionFunction>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "RtlGetVersion"));
    if (!getVersion || getVersion(&version) || version.dwMajorVersion < 10 || version.dwBuildNumber < 19041)
      throw std::runtime_error("Cursor-free recording requires Windows 10 version 2004 (build 19041) or later.");
    check(RoInitialize(RO_INIT_MULTITHREADED), "Initialize Windows recording");
    SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    Ptr<Capture::IGraphicsCaptureSessionStatics> support;
    factory(L"Windows.Graphics.Capture.GraphicsCaptureSession", support);
    boolean available = false; check(support->IsSupported(&available), "Check Windows recording support");
    if (!available) throw std::runtime_error("Windows Graphics Capture is unavailable on this computer.");
    Graphics graphics;
    Ptr<Capture::IDirect3D11CaptureFramePoolStatics2> poolFactory;
    factory(L"Windows.Graphics.Capture.Direct3D11CaptureFramePool", poolFactory);
    if (argc == 2 && std::string(argv[1]) == "--check") {
      std::puts("SwoopCapture 1.0; Windows Graphics Capture and D3D11 ready"); return 0;
    }
    Ptr<IGraphicsCaptureItemInterop> interop;
    factory(L"Windows.Graphics.Capture.GraphicsCaptureItem", interop);
    Ptr<Capture::IGraphicsCaptureItem> item;
    HWND window = nullptr;
    if (argc >= 3 && std::string(argv[1]) == "--window") {
      long long handle = integer(argv[2]);
      if (handle <= 0) throw std::runtime_error("Invalid capture window.");
      window = reinterpret_cast<HWND>(static_cast<uintptr_t>(handle));
      if (!IsWindow(window) || IsIconic(window)) throw std::runtime_error("Restore the selected window before recording.");
      check(interop->CreateForWindow(window, __uuidof(Capture::IGraphicsCaptureItem), item.address()), "Open the selected recording window");
    } else if (argc >= 6 && std::string(argv[1]) == "--display") {
      long long x = integer(argv[2]), y = integer(argv[3]), width = integer(argv[4]), height = integer(argv[5]);
      if (x < -131072 || x > 131072 || y < -131072 || y > 131072 || width < 1 || width > 16384 || height < 1 || height > 16384) throw std::runtime_error("Invalid capture display.");
      POINT point{static_cast<LONG>(x + width / 2), static_cast<LONG>(y + height / 2)};
      HMONITOR monitor = MonitorFromPoint(point, MONITOR_DEFAULTTONULL);
      MONITORINFO info{sizeof(MONITORINFO)};
      if (!monitor || !GetMonitorInfoW(monitor, &info) || info.rcMonitor.left != x || info.rcMonitor.top != y || info.rcMonitor.right - x != width || info.rcMonitor.bottom - y != height) throw std::runtime_error("The selected display configuration changed. Choose it again.");
      check(interop->CreateForMonitor(monitor, __uuidof(Capture::IGraphicsCaptureItem), item.address()), "Open the selected recording display");
    } else throw std::runtime_error("Choose a recording window or display.");
    HANDLE parent = nullptr;
    for (int index = 3; index + 1 < argc; ++index) {
      if (std::string(argv[index]) == "--parent") {
        long long pid = integer(argv[index + 1]);
        if (pid < 1 || pid > 0xffffffffLL) throw std::runtime_error("Invalid recording owner.");
        parent = OpenProcess(SYNCHRONIZE, FALSE, static_cast<DWORD>(pid));
        if (!parent) throw std::runtime_error("The recording owner is no longer running.");
      }
    }
    Size size{}; check(item->get_Size(&size), "Read recording dimensions");
    if (size.Width < 1 || size.Height < 1 || size.Width > 16384 || size.Height > 16384) throw std::runtime_error("The recording dimensions are unsupported.");
    Ptr<Capture::IDirect3D11CaptureFramePool> pool;
    check(poolFactory->CreateFreeThreaded(graphics.runtime, ABI::Windows::Graphics::DirectX::DirectXPixelFormat_B8G8R8A8UIntNormalized, 2, size, pool.out()), "Create the Windows recording frame pool");
    Ptr<Capture::IGraphicsCaptureSession> session;
    check(pool->CreateCaptureSession(item, session.out()), "Create the Windows recording session");
    Ptr<Capture::IGraphicsCaptureSession2> cursorControl;
    check(session->QueryInterface(__uuidof(Capture::IGraphicsCaptureSession2), cursorControl.address()), "Cursor-free recording requires Windows 10 version 2004 or later");
    bool cursor = false;
    for (int index = 3; index < argc; ++index) if (std::string(argv[index]) == "--cursor-control") cursor = true;
    check(cursorControl->put_IsCursorCaptureEnabled(cursor), "Exclude the Windows cursor from recording");
    Ptr<IWICImagingFactory> wic;
    check(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, __uuidof(IWICImagingFactory), wic.address()), "Create the Windows image encoder");
    check(session->StartCapture(), "Start Windows recording");
    Ptr<ID3D11Texture2D> staging;
    ULONGLONG startedAt = GetTickCount64();
    bool receivedFrame = false;
    for (;;) {
      if (parent && WaitForSingleObject(parent, 0) != WAIT_TIMEOUT) break;
      if (window && (!IsWindow(window) || IsIconic(window))) throw std::runtime_error("The recorded window closed or was minimized.");
      Ptr<Capture::IDirect3D11CaptureFrame> frame;
      check(pool->TryGetNextFrame(frame.out()), "Read the Windows recording frame");
      if (!frame.p) {
        if (!receivedFrame && GetTickCount64() - startedAt > 15000) throw std::runtime_error("Windows did not provide a frame. Unlock the desktop and choose the source again.");
        check(graphics.device->GetDeviceRemovedReason(), "The recording graphics device disconnected");
        // WGC may stop emitting frames while the source is completely still.
        // That is a valid recording; the renderer repeats the most recent image.
        Sleep(4); continue;
      }
      Size content{}; check(frame->get_ContentSize(&content), "Read recording content size");
      if (content.Width != size.Width || content.Height != size.Height) throw std::runtime_error("The recorded window or display changed size. Start a new take with its new size.");
      Ptr<Direct3D::IDirect3DSurface> surface; check(frame->get_Surface(surface.out()), "Read recording surface");
      Ptr<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess> access;
      check(surface->QueryInterface(__uuidof(Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess), access.address()), "Read recording texture interface");
      Ptr<ID3D11Texture2D> texture;
      check(access->GetInterface(__uuidof(ID3D11Texture2D), texture.address()), "Read recording texture");
      if (!staging.p) {
        D3D11_TEXTURE2D_DESC desc{}; texture->GetDesc(&desc);
        desc.Width = size.Width; desc.Height = size.Height; desc.Usage = D3D11_USAGE_STAGING;
        desc.BindFlags = 0; desc.MiscFlags = 0; desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
        check(graphics.device->CreateTexture2D(&desc, nullptr, staging.out()), "Create recording transfer texture");
      }
      D3D11_BOX box{0, 0, 0, static_cast<UINT>(size.Width), static_cast<UINT>(size.Height), 1};
      graphics.context->CopySubresourceRegion(staging, 0, 0, 0, 0, texture, 0, &box);
      D3D11_MAPPED_SUBRESOURCE mapped{};
      check(graphics.context->Map(staging, 0, D3D11_MAP_READ, 0, &mapped), "Read recording pixels from graphics memory");
      std::vector<unsigned char> bytes;
      try { bytes = jpeg(wic, size.Width, size.Height, static_cast<BYTE*>(mapped.pData), mapped.RowPitch); }
      catch (...) { graphics.context->Unmap(staging, 0); throw; }
      graphics.context->Unmap(staging, 0);
      closeInspectable(frame);
      DWORD written = 0;
      if (!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) || written != bytes.size()) break;
      receivedFrame = true;
    }
    closeInspectable(session); closeInspectable(pool);
    if (parent) CloseHandle(parent);
    return 0;
  } catch (const std::exception& error) { std::fprintf(stderr, "%s\n", error.what()); return 1; }
}
