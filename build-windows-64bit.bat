@echo off
SETLOCAL EnableDelayedExpansion
TITLE Geovanta Vector Studio — Build Windows 64-Bit Installer (Rust + Tauri)

echo ============================================================================
echo   GEOVANTA VECTOR STUDIO — WINDOWS 64-BIT DESKTOP INSTALLER BUILDER
echo   Target Architecture: x86_64-pc-windows-msvc (64-Bit NSIS .exe ^& WiX .msi)
echo ============================================================================
echo.

where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Rust / Cargo belum terinstal. Silakan instal Rust 64-bit dari https://rustup.rs
    pause
    exit /b 1
)

echo [1/3] Memastikan target Rust Windows 64-bit (x86_64-pc-windows-msvc) aktif...
rustup target add x86_64-pc-windows-msvc

echo [2/3] Mengompilasi bundle offline React 18 + Tailwind CSS ke folder web...
node scripts/build-offline-bundle.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Kompilasi bundle gagal.
    pause
    exit /b 1
)

echo [3/3] Mengompilasi installer Windows 64-bit (.exe NSIS ^& .msi WiX)...
cd src-tauri
cargo tauri build --target x86_64-pc-windows-msvc
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build Tauri gagal. Installer TIDAK dibuat.
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo   SELESAI! File installer Windows 64-bit tersedia di:
echo   - src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Geovanta Vector Studio_1.1.0_x64-setup.exe
echo   - src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msi\Geovanta Vector Studio_1.1.0_x64_en-US.msi
echo ============================================================================
pause
