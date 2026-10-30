// 🔴 Em Windows, uma aplicação de consola que abre uma janela **também** abre
// um terminal preto por baixo. O produto vai para a máquina do técnico, e um
// terminal flashes a quem o instalação. Daí o `#![windows_subsystem]`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aegis_gui_lib::run()
}
