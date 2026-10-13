# KitBash KVM — User Guide

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Action Bar](#action-bar)
4. [Video & Camera](#video--camera)
5. [KVM Input (Keyboard & Mouse)](#kvm-input-keyboard--mouse)
6. [Send Text](#send-text)
7. [Send Advanced Text](#send-advanced-text)
8. [Send Common Hotkeys](#send-common-hotkeys)
9. [Send Media Keys](#send-media-keys)
10. [Macros](#macros)
11. [QR Code Scanner](#qr-code-scanner)
12. [OCR Text Extraction](#ocr-text-extraction)
13. [Screenshots & Video Recording](#screenshots--video-recording)
14. [Settings](#settings)
15. [Advanced Text Command Reference](#advanced-text-command-reference)

---

## Overview

KitBash KVM is a browser/desktop application that lets you control a remote computer over a serial connection using a USB capture card and a CH9329-based HID adapter (such as the Sipeed NanoKVM USB). It streams video from the capture card and forwards keyboard and mouse input over serial to the target machine — no software required on the target.

---

## Getting Started

1. Connect your USB capture card to the source machine's video output.
2. Connect your CH9329/NanoKVM USB adapter between your computer and the target machine.
3. Open KitBash KVM.
4. Select your **Video** and **Audio** devices from the dropdowns in the action bar.
5. Press the **Play** button to start the video stream.
6. Select your **Serial Port** (the CH9329/NanoKVM adapter) and the correct **Baud Rate**.
7. Click **Connect** to begin forwarding keyboard and mouse input.

---

## Action Bar

The action bar runs across the top of the screen and contains all controls.

### Float Mode vs. Static Mode

- **Float Mode** (default): The bar is a rounded pill that appears when you move the mouse and auto-hides after a short period of inactivity. This keeps the view unobstructed during use.
- **Static Mode**: The bar is always visible. Toggle this in Settings → Float UI.

### Auto-Hide Behavior

- Moving the mouse or pressing a key shows the bar.
- Entering keyboard/mouse capture mode (clicking the video area when connected) **automatically hides** the bar so it doesn't interfere.
- Pressing **Escape** to exit capture mode **automatically shows** the bar again.

### Dragging

Click and drag on any open area of the action bar to reposition it horizontally (up to 25% of the screen width in either direction).

### Desktop-Only Controls (Tauri)

When running as a desktop app, two extra buttons appear:

| Button | Function |
|--------|----------|
| Fullscreen | Toggle fullscreen |
| Always on Top (📌 / 🔝) | Pin the window above all other windows |

---

## Video & Camera

### Device Selection

| Control | Description |
|---------|-------------|
| Video dropdown | Select the USB capture card |
| Audio dropdown | Select the audio input from the capture card |
| ▶ Play | Start streaming from selected devices |
| ⏹ Stop | Stop the stream |
| ✕ Reset | Clear device selection |

A device info overlay appears briefly when the stream starts, showing the device name, resolution, and frame rate.

### Resolution & Frame Rate

KitBash KVM can test and discover which resolution/FPS combinations your capture card actually supports.

1. Start the video stream.
2. Open **Settings → Video tab**.
3. Click **Recheck Video Settings** — the app tests every common resolution and frame rate combination and lists only those your device confirms it can deliver.
4. Select a combination from the **Resolution & FPS** dropdown.
5. Click **Apply Resolution & Frame Rate Settings**.

Tested combinations are cached per device so rechecking is only needed once, or when you change hardware.

### Video Fit Modes

Controls how the video fills the viewport:

| Mode | Behaviour |
|------|-----------|
| `contain` | Letterboxed — full frame visible, aspect ratio preserved |
| `fill` | Stretches to fill, may distort |
| `cover` | Fills viewport, crops edges, aspect ratio preserved |
| `none` | Original captured resolution, no scaling |

### Flip & Rotate

Found in **Settings → Video tab → right column**:

- **Rotation**: None, 90°, −90°, 180°
- **Flip Horizontal / Flip Vertical**: Mirror the image

### Video Filters

Optional CSS-based visual filters (for display only, does not affect capture):

- Grayscale, Sepia, High Contrast, Hue Rotate, Blur, Invert, Brightness

---

## KVM Input (Keyboard & Mouse)

### Connecting

1. Select the serial port for your CH9329/NanoKVM adapter from the **Serial Port** dropdown.
2. Choose the correct **Baud Rate**:
   - `9600` — Standard CH9329 default
   - `57600` — Sipeed NanoKVM USB default
   - `115200` — Modified CH9329 firmware
3. Click **Connect**.

### Keyboard Capture

Once connected, click anywhere on the video to enter capture mode. All keystrokes are forwarded to the target machine.

- **Exit capture**: Press **Escape** — the action bar reappears automatically.
- Full modifier support: Ctrl, Shift, Alt, Meta/Win/Cmd.
- **Keyboard Compatible Mode**: Enable in Settings if keystrokes behave incorrectly on Linux or older systems. Sends keys using an alternate HID report format.

### Mouse Modes

Set in **Settings → Settings tab → Cursor Mode**:

#### Absolute Mode (default)

The mouse position maps directly to coordinates on the target screen. A crosshair cursor indicates the active area.

- **Absolute Mouse Area**: Configure what percentage of the video area the mouse maps to (width and height, 0–100%). Useful when the target resolution doesn't match the capture area.

#### Relative Mode

Uses pointer lock — your mouse movements are captured as deltas and forwarded directly. Recommended for Linux guests where absolute positioning is unreliable.

### Auto Capture Mouse

When enabled (default), clicking the video area immediately captures the mouse. When disabled, a confirmation dialog appears first.

---

## Send Text

Sends a string of plain text to the target machine as a series of keystrokes.

1. Click **Send Text** in the action bar.
2. Type or paste your text in the dialog.
3. Press **OK** or **Ctrl+Enter** to send.

- Characters are sent one at a time with a small delay between each.
- Only ASCII characters are supported. Unsupported characters trigger a warning.
- Uppercase letters are sent using Shift automatically.

---

## Send Advanced Text

Sends text with embedded command sequences for pressing special keys, modifier combinations, and timed delays.

1. Click **Send Adv. Text** in the action bar.
2. Enter your text and commands in the dialog.
3. Press **OK** or **Ctrl+Enter** to send.

### Escape Sequence Syntax

Commands are wrapped in escape markers. Three styles are available (configure in Settings → Settings tab):

| Style | Example |
|-------|---------|
| Square brackets (default) | `[[ENTER]]` |
| Curly braces | `{{ENTER}}` |
| Pipe bars | `\|\|ENTER\|\|` |

### Examples

```
Username[[TAB]]Password[[DELAY=1]][[ENTER]]
[[WIN+M]]
[[CTRL+ALT+DEL]]
Hello[[DELAY=0.5]]World
```

See [Advanced Text Command Reference](#advanced-text-command-reference) for a full list of supported commands.

---

## Send Common Hotkeys

Sends a single predefined key combination with one click. Select from the dropdown and press **Send**.

| Hotkey | Description |
|--------|-------------|
| Ctrl + Alt + Del | Open task manager / login screen |
| Alt + F4 | Close active window |
| Ctrl + Space | Input method toggle |
| Alt + Space | Window system menu |
| Meta / Win | Open Start menu |
| Meta / Win + Tab | Task view / Mission Control |
| Alt + Tab | Switch windows |
| Esc | Escape key |
| Capslock | Toggle caps lock |
| F1 | F1 key |
| F2 | F2 key |
| F10 | F10 key |
| F12 | F12 / Developer tools |
| Delete | Delete key |

---

## Send Media Keys

Controls media playback and system power state on the target machine.

### Media Control

| Key | Action |
|-----|--------|
| 🔇 Mute | Toggle mute |
| 🔊 Volume Up | Increase volume |
| 🔉 Volume Down | Decrease volume |

### ACPI Power Keys

| Key | Action |
|-----|--------|
| Wake-up | Wake from sleep |
| Sleep | Put to sleep |
| Power | Power button |

---

## Macros

Macros let you save frequently used advanced text sequences and run them instantly.

### Creating a Macro

1. Open **Settings → Macros tab**.
2. Click **Add Macro**.
3. Enter a name (up to 30 characters) and the macro message using [Advanced Text syntax](#advanced-text-command-reference).
4. Click **OK**.

### Running a Macro

Select a macro from the **Select Macro** dropdown in the action bar and press the run button. The macro executes immediately.

### Managing Macros

| Button | Action |
|--------|--------|
| Edit (✏) | Modify the macro name or message |
| Delete (🗑) | Remove the macro |
| Clear All | Delete all macros (confirmation required) |
| Import | Load macros from a `.json` file |
| Export | Save all macros to a `.json` file |

Exported files are named `kbkvm_macros_YYYY-MM-DD_HH-mm-ss.json`.

### Searching Macros

Use the search box in the Macros tab to filter by name or message content.

---

## QR Code Scanner

Scan QR codes displayed on the target machine's screen.

1. Click the **QR Scanner** button (cyan icon) in the action bar.
2. A selection overlay appears over the video. Drag to draw a box around the QR code.
3. Release — the app decodes the QR code and copies the result to the clipboard.
4. A notification confirms success or indicates no code was found.

**Auto-Open QR Links**: Enable in Settings to automatically open scanned URLs in a new browser tab.

> Press **Escape** to cancel without scanning.

---

## OCR Text Extraction

Extract text visible on the target machine's screen using optical character recognition.

1. Click the **OCR** button (orange icon) in the action bar.
2. A selection overlay appears. Drag to draw a box around the text you want to extract.
3. Release — Tesseract.js processes the image and copies the recognised text to the clipboard.
4. A notification confirms success or warns if no text was found.

**Auto-Open OCR URLs**: Enable in Settings to automatically open any URLs found in the extracted text.

> Press **Escape** to cancel without scanning.

---

## Screenshots & Video Recording

### Screenshots

| Action | Result |
|--------|--------|
| Click screenshot button | Full-frame PNG screenshot |
| Shift+Click screenshot button | Area selection — drag to capture a region |

Screenshots are automatically downloaded as `screenshot_kbkvm_YYYY-MM-DD_HH-mm-ss.png`.

### Video Recording

1. Click the **Record** button to start recording.
2. The button turns red and blinks while recording.
3. Click again to stop — the recording downloads automatically.

---

## Settings

Open with the **Settings (⚙)** button in the action bar. Settings are saved automatically.

### Video Tab

| Setting | Description |
|---------|-------------|
| Current Resolution | Displays active width × height @ FPS |
| Recheck Video Settings | Re-test all resolution/FPS combinations |
| Resolution & FPS | Select a tested combination |
| Apply Resolution & Frame Rate Settings | Apply the selected combination |
| Video Fit Mode | contain / fill / cover / none |
| Rotation | 0° / 90° / −90° / 180° |

### Settings Tab

| Setting | Description |
|---------|-------------|
| Baud Rate | 9600 / 57600 / 115200 |
| Keyboard Compatible Mode | Alternate key format for Linux/older systems |
| Auto Capture Mouse | Capture mouse on click without confirmation |
| Auto-Open QR Code Links | Open scanned QR URLs automatically |
| Auto-Open OCR Extracted URLs | Open OCR-detected URLs automatically |
| Adv. Text Escape Sequence | `[[ ]]` / `{{ }}` / `\|\| \|\|` |
| Cursor Mode | absolute / relative |
| Absolute Mouse Area Width | Percentage of video width mapped to target (0–100%) |
| Absolute Mouse Area Height | Percentage of video height mapped to target (0–100%) |

### Macros Tab

Full macro management interface — see [Macros](#macros).

---

## Advanced Text Command Reference

Use these commands inside escape markers (e.g. `[[ENTER]]`).

### Timing

| Command | Description |
|---------|-------------|
| `DELAY=N` | Wait N seconds (decimals supported, e.g. `DELAY=0.5`) |

### Navigation & Editing

| Command | Key |
|---------|-----|
| `ENTER` | Return |
| `ESCAPE` or `ESC` | Escape |
| `TAB` | Tab |
| `SPACE` | Space bar |
| `BACKSPACE` | Backspace |
| `DELETE` or `DEL` | Delete |
| `INSERT` | Insert |
| `HOME` | Home |
| `END` | End |
| `PAGEUP` | Page Up |
| `PAGEDOWN` | Page Down |
| `UP` or `ARROWUP` | ↑ |
| `DOWN` or `ARROWDOWN` | ↓ |
| `LEFT` or `ARROWLEFT` | ← |
| `RIGHT` or `ARROWRIGHT` | → |

### Function Keys

`F1` `F2` `F3` `F4` `F5` `F6` `F7` `F8` `F9` `F10` `F11` `F12`

### Lock Keys

| Command | Key |
|---------|-----|
| `CAPSLOCK` | Caps Lock |
| `NUMLOCK` | Num Lock |
| `SCROLLLOCK` | Scroll Lock |
| `PAUSE` | Pause/Break |

### Modifier Combinations

Combine modifiers with `+`:

| Modifier | Aliases |
|----------|---------|
| `CTRL` | `CONTROL` |
| `SHIFT` | — |
| `ALT` | — |
| `WIN` | `META`, `CMD` |

**Examples:**

```
[[CTRL+C]]           Copy
[[CTRL+V]]           Paste
[[CTRL+Z]]           Undo
[[ALT+F4]]           Close window
[[CTRL+ALT+DEL]]     Secure attention sequence
[[WIN+M]]            Minimise all windows
[[WIN+L]]            Lock screen
[[SHIFT+TAB]]        Reverse tab
[[CTRL+SHIFT+ESC]]   Open Task Manager (Windows)
```

### Full Example Script

```
[[CTRL+ALT+DEL]]
[[DELAY=2]]
admin[[TAB]][[DELAY=0.5]]P@ssw0rd[[ENTER]]
[[DELAY=3]]
[[WIN+R]]
[[DELAY=0.5]]
cmd[[ENTER]]
[[DELAY=1]]
ipconfig /all[[ENTER]]
```
