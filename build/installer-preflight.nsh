; Offline checks for the bundled Windows x64 app. The standard electron-builder
; installer remains responsible for extraction, shortcuts and uninstall entries.
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!ifndef BUILD_UNINSTALLER
  Var swoopProbePath
  Var swoopDependencyExit
  Var swoopDependencyOutput
  Var swoopDependencyReport

  !macro customInit
    ${IfNot} ${AtLeastWin10}
      MessageBox MB_OK|MB_ICONSTOP "Swoop Studio requires Windows 10 or Windows 11. Setup cannot continue on this version of Windows." /SD IDOK
      SetErrorLevel 1633
      Quit
    ${EndIf}
    ${IfNot} ${IsNativeAMD64}
      MessageBox MB_OK|MB_ICONSTOP "This installer requires an Intel or AMD 64-bit Windows PC. ARM64 and 32-bit Windows need a different Swoop Studio build." /SD IDOK
      SetErrorLevel 1633
      Quit
    ${EndIf}
  !macroend

  !macro swoopCheckWritableTarget
    ; Test an actual create/delete operation, including silent /D= installs.
    ClearErrors
    CreateDirectory "$INSTDIR"
    IfErrors swoopWritableFailed
    GetTempFileName $swoopProbePath "$INSTDIR"
    IfErrors swoopWritableFailed
    Delete "$swoopProbePath"
    IfErrors swoopWritableFailed
    Goto swoopWritableDone
    swoopWritableFailed:
    MessageBox MB_OK|MB_ICONSTOP "Swoop Studio cannot write to:$\r$\n$INSTDIR$\r$\n$\r$\nRestart Setup and choose a folder you can write to, such as a folder inside your user account or on K:. Administrator access is not required." /SD IDOK
    SetErrorLevel 5
    Abort
    swoopWritableDone:
  !macroend

  !macro customCheckAppRunning
    ; Run before the standard template uninstalls an earlier version. Never
    ; force-close a recording or silently discard a user's open project.
    !insertmacro swoopCheckWritableTarget
    swoopWaitForApp:
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 == 0
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Swoop Studio is open. Save your project and close its windows, then choose Retry to continue Setup." /SD IDCANCEL IDRETRY swoopWaitForApp
        SetErrorLevel 1618
        Abort
      ${ElseIf} $R0 != 603
        MessageBox MB_OK|MB_ICONSTOP "Setup could not check whether Swoop Studio is running (process check $R0). Close Swoop Studio and restart Setup." /SD IDOK
        SetErrorLevel 1618
        Abort
      ${EndIf}
      ${nsProcess::Unload}
  !macroend

  !macro swoopCheckBundledDependencies
    InitPluginsDir
    DetailPrint "Checking bundled runtime, cursor capture and MP4 encoder..."
    StrCpy $swoopDependencyReport "$INSTDIR\dependency-report.json"
    ClearErrors
    Delete "$swoopDependencyReport"
    ${If} ${FileExists} "$swoopDependencyReport"
      MessageBox MB_OK|MB_ICONSTOP "Setup cannot replace its dependency report:$\r$\n$swoopDependencyReport$\r$\n$\r$\nCheck that this file is writable, then restart Setup." /SD IDOK
      SetErrorLevel 5
      Abort
    ${EndIf}
    ; A shell configured for Electron development must not bypass the app CLI.
    System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0)'
    nsExec::ExecToStack /TIMEOUT=90000 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --check-dependencies --dependency-report="$swoopDependencyReport" --dependency-work-dir="$PLUGINSDIR"'
    Pop $swoopDependencyExit
    Pop $swoopDependencyOutput
    StrCpy $R9 0
    ${If} ${FileExists} "$swoopDependencyReport"
      ClearErrors
      FileOpen $R8 "$swoopDependencyReport" r
      ${IfNot} ${Errors}
        FileSeek $R8 0 END $R9
        FileClose $R8
      ${EndIf}
    ${EndIf}
    ${If} $swoopDependencyExit != 0
    ${OrIf} $R9 < 2
      MessageBox MB_OK|MB_ICONSTOP "Swoop Studio could not pass its offline dependency check (result: $swoopDependencyExit).$\r$\n$\r$\n$swoopDependencyOutput$\r$\n$\r$\nIf a report was created, read:$\r$\n$swoopDependencyReport$\r$\n$\r$\nThe installer includes Electron, cursor capture and FFmpeg. Restart Setup to restore missing files. If Windows blocked a component, review Windows Security before retrying. Setup has stopped before adding shortcuts or an uninstall entry." /SD IDOK
      SetErrorLevel 1603
      Abort
    ${EndIf}
    DetailPrint "Offline dependency check passed. Report: $swoopDependencyReport"
  !macroend

  ; Called immediately after the embedded x64 payload is decompressed, before
  ; registryAddInstallInfo/addDesktopLink. Disable electron-builder's separate
  ; precompressed-file macros in the config so this hook cannot be overwritten.
  !ifmacrodef customFiles_x64
    !error "Swoop dependency check conflicts with generated precompressed files. Set nsis.preCompressedFileExtensions to an empty array."
  !endif
  !macro customFiles_x64
    !insertmacro swoopCheckBundledDependencies
  !macroend
!endif
