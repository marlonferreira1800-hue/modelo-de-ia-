# 🎮 ULTRA 64 Cloud Deck — Nintendo 64 Web Console & Emulator

Console Nintendo 64 em nuvem rodando a **60 FPS** direto no navegador com suporte a:
1. **Slot de ROM Real de Nintendo 64 (`.z64`, `.n64`, `.v64`, `.zip`)** via núcleo **Mupen64Plus-Next (EmulatorJS WebAssembly/WebGL)**.
2. **3 Cartuchos 3D Integrados (Instant Play sem precisar baixar ROMs)**:
   - 🏎️ **Ultra Kart 64 — Royal Raceway**: Corrida 3D com drift (`Z`), mini-turbo, rampas de boost e 5 rivais de IA.
   - ⭐ **Super Poly 64 — Star Courtyard**: Plataforma 3D livre no pátio do castelo com pulo triplo, moedas e 5 Power Stars.
   - 🚀 **Lylat Wing 64 — Corneria Sector**: Combate espacial 3D em uma nave Arwing com *Barrel Roll* (`Z`), lasers duplos e esquadrões inimigos.
3. **Controle N64 Interativo**: Suporte a Teclado (`WASD`/Setas + `Espaço` + `Shift` + `Z`), Mouse/Touch na tela e controles físicos USB/Bluetooth (Gamepad API).

## 🚀 Como rodar no seu GitHub Codespace ou Localmente

```bash
git pull origin main
python3 -m http.server 8080
```
Depois basta abrir a porta `8080` no navegador!
