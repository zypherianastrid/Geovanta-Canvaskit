// Prevents additional console window on Windows 64-bit in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    geovanta_desktop_lib::run();
}
