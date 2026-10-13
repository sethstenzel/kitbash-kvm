# KitBash KVM — User Guide

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Command Bar](#command-bar)
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

- **Web app**: [controller.kitbashkvm.com](https://controller.kitbashkvm.com) in a Chromium-based browser (Chrome, Edge) — Web Serial is required for keyboard and mouse control. The web app can be installed as an app (PWA) and updates itself automatically.
- **Desktop app**: the same app built with Tauri, with an extra "keep window on top" button.

---

## Getting Started

1. Connect your USB capture card to the target machine's video output.
2. Connect your CH9329/NanoKVM USB adapter between your computer and the target machine.
3. Open KitBash KVM and allow camera and microphone access when the browser asks. (If access was denied, the source icons show a warning badge — click one to ask again.)
4. Click the **Video Source** icon in the command bar and pick your capture card — the stream starts right away. Optionally pick the capture card's audio from the **Audio Source** icon.
5. Set the correct **Baud Rate** in **Settings → Settings tab** (`57600` for a Sipeed NanoKVM USB, `9600` for a standard CH9329).
6. Click **Connect KVM (Serial)** and choose the adapter's port in the browser's port chooser. If no baud rate has been set yet, the app asks for one (default `9600`).
7. Keyboard input is now forwarded to the target. Click the video to capture the mouse.

The selected video device is remembered: it starts automatically next time, and if it is not plugged in yet, the stream starts as soon as it appears.

---

## Command Bar

The command bar runs across the top of the screen and contains all controls. It uses the logo blue with white icons; hover over any icon for a tooltip.

| Group | Controls |
|-------|----------|
| Media | Video Source, Audio Source, Start / Stop Media Devices, Reset Media Devices |
| Capture | Screenshot, Text Extraction (OCR), QR Code Scanner, Record Video |
| KVM | Connect / Disconnect KVM (Serial), Stop Sending Text (only while sending), Text Transfer, Send Common Hotkeys, Send Media Keys, Macros (once connected) |
| App | Settings, Video Only Mode, Fullscreen (plus Keep on Top in the desktop app) |

The KVM group is hidden when **Enable KVM keyboard & mouse control** is turned off in Settings.

### Icon Colours

- **Video Source** / **Audio Source** icons turn **green** while that source is live.
- **Stop Media Devices** and **Reset Media Devices** are **red**.
- **Record** turns **red** and blinks while recording.
- Screenshot and Record are greyed out, and OCR / QR are hidden, while no video is streaming.

### Docked vs. Floating Command Bar

Choose in **Settings → Video tab → Command Bar**:

- **Floating Command Bar** (default): a rounded bar that slides down over the video. It hides while you control the target and comes back when you release control.
- **Docked Command Bar**: a full-width strip that is always visible above the video, with the icons centred.

### Auto-Hide Behaviour (Floating)

- Typing on the target or moving the mouse in the captured video area **hides** the bar.
- Holding **Esc** for about a second releases keyboard & mouse and **shows** the bar again (see [Keyboard Capture](#keyboard-capture)). In relative mouse mode, leaving pointer lock also shows it.
- Starting a QR or OCR scan hides the bar until the scan ends.
- With KVM input disabled, the bar shows when you move the mouse and hides (together with the cursor) after 3 seconds of inactivity.

### Dragging

Click and drag on any open area of the command bar to reposition it horizontally (up to 25% of the screen width in either direction).

### Video Only Mode

The **Video Only Mode** button hides the command bar and stops forwarding keyboard and mouse input, so you can simply watch the target. Press **Esc** to exit.

### Fullscreen & Desktop Controls

In the browser, the **Fullscreen** button (or double-clicking the video while the mouse isn't captured) toggles fullscreen. When running as a desktop app, two buttons are shown instead:

| Button | Function |
|--------|----------|
| Fullscreen | Toggle fullscreen |
| Keep window on top (pin) | Pin the window above all other windows |

---

## Video & Camera

### Device Selection

| Control | Description |
|---------|-------------|
| Video Source | Menu of video devices; a checkmark marks the current one. Selecting a device starts the stream; **None** turns it off |
| Audio Source | Menu of audio inputs, with a checkmark on the current one; **None** turns audio off |
| ▶ Start Media Devices | Start streaming from the selected devices |
| ⏹ Stop Media Devices | Stop the stream |
| Reset Media Devices | Stop the stream and clear the video/audio selection |

When the stream starts, a notification shows the device name, resolution and frame rate.

If the capture card is unplugged, the stream stops with a warning and **resumes automatically** when it is plugged back in. A missing or busy audio device never blocks video: the stream starts video-only and audio is added back when the device returns.

### Resolution & Frame Rate

By default the stream runs in **Auto** mode: the app requests 1920×1080 @ 60 fps and the capture card delivers the best mode it supports up to that (for example 1080p30 on MS2109-based cards, 1080p60 on MS2130).

The first time a device streams, the app tests which resolution/FPS combinations it really supports and caches the list per device. To pick a specific mode:

1. Start the video stream.
2. Open **Settings → Video tab**.
3. Select a mode from the **Resolution & Frame Rate** dropdown (or **Auto (best available, up to 1080p @ 60fps)**).
4. Click **Apply Resolution & Frame Rate Settings** — the stream restarts in that mode and an overlay shows the actual and requested resolution for a few seconds.

The chosen mode is remembered for that device. Click **Recheck Video Settings** to clear the cached list and re-test the device.

### Video Fit Modes

Controls how the video fills the viewport:

| Mode | Behaviour |
|------|-----------|
| `contain` | Letterboxed — full frame visible, aspect ratio preserved (default) |
| `fill` | Stretches to fill, may distort |
| `cover` | Fills viewport, crops edges, aspect ratio preserved |
| `none` | Original captured resolution, no scaling |

### Flip & Rotate

Found in **Settings → Video tab → Flip & Rotate Video**:

- **Rotate**: None, 90°, −90°, 180°
- **Flip**: **Mirror (left-right)** and **Flip upside down** (can be combined)

Mouse input, screenshots, OCR and QR scans all follow the rotation and flips. **Reset display settings** (under the resolution controls) puts rotation, flips and fit mode back to their defaults.

---

## KVM Input (Keyboard & Mouse)

### Connecting

1. Choose the correct **Baud Rate** in **Settings → Settings tab**:
   - `9600` — Standard CH9329 default
   - `57600` — Sipeed NanoKVM USB default
   - `115200` — Modified CH9329 firmware
2. Click **Connect KVM (Serial)** in the command bar and select the adapter's port.

After connecting, the app asks the chip for its info. If it does not answer, a warning says the baud rate may be wrong. Changing the baud rate while connected closes the connection; connect again afterwards.

If the adapter is unplugged or the connection fails, all keys and buttons are released, a **KVM serial device disconnected** warning appears and the connect button returns. Click **Disconnect KVM (Serial)** to close the connection yourself.

### Keyboard Capture

Once connected, keystrokes are forwarded to the target machine. Clicking the video also captures the mouse.

- Keys are sent by **physical position** (like a real USB keyboard), so the target's keyboard layout decides which character appears. Full modifier support: Ctrl, Shift, Alt, AltGr, Meta/Win/Cmd.
- **Esc** is forwarded to the target like any other key.
- **Hold Esc for about 1 second** to release keyboard & mouse capture — the command bar reappears. Click the video to capture again.
- While the mouse is over the command bar, or one of its menus is open, key presses are **not** sent to the target (so e.g. Shift+Click on a toolbar button works). Open dialogs and Settings also keep their keys.
- All held keys and buttons are released on the target when the window loses focus.
- **Keyboard Lock**: in browser fullscreen while the KVM is connected, shortcuts such as Ctrl+W, Ctrl+T, Ctrl+N and Alt+Tab go to the target instead of your browser/OS (Chromium browsers).
- **Keyboard Compatible Mode**: Enable in Settings if keystrokes behave incorrectly on Linux or older systems. Keys are tapped (pressed and released at once) instead of held; this breaks Ctrl+scroll-wheel zoom.

### Pasting the Clipboard (Ctrl+V)

With **Type clipboard on Ctrl+V** enabled (default), pressing **Ctrl+V** (**Cmd+V** on Mac) while controlling the target types your local clipboard text on the target. If the clipboard holds no text, a normal Ctrl+V is sent. **Ctrl+Shift+V** is always sent as a normal keystroke. Only ASCII characters can be typed.

### Mouse Modes

Set in **Settings → Settings tab → Cursor Mode**:

#### Absolute Mode (default)

The mouse position maps directly to coordinates on the target screen.

- **Absolute Mouse Area**: Configure what percentage of the video the mouse maps to (width and height, 10–100%, centred). Useful when the target resolution doesn't match the capture area. While Settings is open, the area is outlined in red.

#### Relative Mode

Uses pointer lock — your mouse movements are captured as deltas and forwarded directly. Recommended for Linux and Android targets, which may not support absolute positioning.

### Auto Capture Mouse

When enabled (default), clicking the video area immediately captures the mouse. When disabled, a confirmation dialog appears first.

---

## Send Text

Sends a string of plain text to the target machine as a series of keystrokes.

1. Open the **Text Transfer** menu in the command bar and choose **Send Text...**.
2. Type or paste your text in the dialog.
3. Press **OK** or **Ctrl+Enter** to send.

- Characters are sent one at a time with a small delay between each. Line breaks are sent as Enter, tabs as Tab.
- Only ASCII characters are supported. Unsupported characters are skipped and listed in a warning.
- Uppercase letters are sent using Shift automatically.
- While text is being sent, a **Stop Sending Text** button appears in the command bar. Click it to cancel the current send and anything queued behind it. Text, hotkeys, clipboard pastes and macros share one queue, so they never mix.

---

## Send Advanced Text

Sends text with embedded command sequences for pressing special keys, modifier combinations, and timed delays.

1. Open the **Text Transfer** menu and choose **Send Adv. Text (Command Key Support)...**.
2. Enter your text and commands in the dialog.
3. Press **OK** or **Ctrl+Enter** to send.

### Escape Sequence Syntax

Commands are wrapped in escape markers. Three styles are available (configure in **Settings → Macros tab → Adv. Text Escape Sequence**; the setting applies to macros too):

| Style | Example |
|-------|---------|
| Square brackets (default) | `[[ENTER]]` |
| Curly braces | `{{ENTER}}` |
| Pipe bars | `\|\|ENTER\|\|` |

Macros also accept the original `|||ENTER|||` syntax whatever style is selected. Text inside markers that is not a known command (for example a shell test `[[ -f file ]]`) is typed as written.

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

Sends a single predefined key combination with one click. Open the **Send Common Hotkeys** menu and pick an entry — it is sent immediately.

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

Controls media playback and system power state on the target machine. Open the **Send Media Keys** menu and pick a key — it is sent immediately.

### ACPI Power Keys

| Key | Action |
|-----|--------|
| Wake-up | Wake from sleep |
| Sleep | Put to sleep |
| Power | Power button |

### Media Control

| Key | Action |
|-----|--------|
| 🔇 Mute | Toggle mute |
| 🔊 Volume Up | Increase volume |
| 🔉 Volume Down | Decrease volume |

---

## Macros

Macros let you save frequently used advanced text sequences and run them instantly. Macros can be grouped into categories.

### Creating a Macro

1. Open **Settings → Macros tab**.
2. Click **Add Macro**.
3. Enter a name (up to 30 characters), choose a **Category** (or Uncategorized) and enter the macro message using [Advanced Text syntax](#advanced-text-command-reference).
4. Click **Save**.

New macros start in the category currently selected in the category filter.

### Categories

Manage categories in the **Categories** section of the Macros tab:

| Action | How |
|--------|-----|
| Create | Type a name (up to 30 characters, must be unique) and click **Add** |
| Rename | Click the pencil, edit the name, then press **Enter** or click the check mark (**Esc** cancels) |
| Delete | Click the trash icon — its macros move to **Uncategorized** (confirmation required if it contains macros) |

### Running a Macro

Once the KVM is connected, a **Macros** menu appears in the command bar. Categories are listed as parent items (with a macro count) that open a sub-menu; uncategorized macros are listed below them. Empty categories are not shown. Select a macro to run it immediately.

### Managing Macros

| Button | Action |
|--------|--------|
| Edit (✏) | Modify the macro name, category or message |
| Delete (🗑) | Remove the macro |
| Clear All | Delete all macros (confirmation required; categories are kept) |
| Import | Load macros and categories from a `.json` file |
| Export | Save all macros and categories to a `.json` file |

Exported files are named `kbkvm_macros_YYYY-MM-DD_HH-mm-ss.json` and include the categories. Importing **replaces** the current macros and categories. Files exported by older versions (without categories) are imported into a category named **Default**. Invalid entries are skipped and reported.

### Searching Macros

Use the search box in the Macros tab to filter by name or message content. The category filter below it (All categories, a single category, or Uncategorized — each with a count) narrows the list first, and the search applies within it.

---

## QR Code Scanner

Scan QR codes displayed on the target machine's screen.

1. Click the **QR Code Scanner** button in the command bar (shown while video is streaming).
2. A selection overlay appears over the video. Drag to draw a box around the QR code.
3. Release — the app decodes the QR code and copies the result to the clipboard.
4. A notification confirms success or indicates no code was found.

The scan uses the full native video resolution and follows rotation/flip settings.

**Auto-Open QR Code Links**: Enable in Settings to open a scanned URL in a new browser tab. Browsers often block tabs opened after a scan, so the link is also shown in a notification to click.

> Press **Escape** to cancel without scanning.

---

## OCR Text Extraction

Extract text visible on the target machine's screen using optical character recognition.

1. Click the **Text Extraction (OCR)** button in the command bar (shown while video is streaming).
2. A selection overlay appears. Drag to draw a box around the text you want to extract.
3. Release — Tesseract.js processes the image and copies the recognised text to the clipboard.
4. A notification confirms success or warns if no text was found.

The selected area is read at the full native video resolution, upright according to the rotation/flip settings. The OCR engine and English language data are downloaded on first use.

**Auto-Open OCR Extracted URLs**: Enable in Settings to open the first URL found in the extracted text. Found URLs are also shown as clickable links in a notification.

> Press **Escape** to cancel without scanning.

---

## Screenshots & Video Recording

### Screenshots

| Action | Result |
|--------|--------|
| Click screenshot button | Area selection — drag to capture a region (Esc cancels) |
| Shift+Click screenshot button | Full-frame PNG screenshot |

Screenshots are taken at the native video resolution, oriented as displayed (rotation and flips applied), and are downloaded automatically as `screenshot_kbkvm_YYYY-MM-DD_HH-mm-ss.png` (full frame) or `screenshot_area_kbkvm_YYYY-MM-DD_HH-mm-ss.png` (area).

### Video Recording

1. Click the **Record Video** button to start recording (video and, if live, audio).
2. The button turns red and blinks while recording.
3. Click again to stop — the recording is saved after about a second and downloads automatically as `record_YYYY-MM-DD_HH-mm-ss.webm` (or `.mp4` where WebM isn't supported).

If the video stream stops while recording, the recording is saved automatically.

---

## Settings

Open with the **Settings (⚙)** button in the command bar. Close it with **Esc**, the close button, or by clicking outside. Settings are saved automatically.

### Video Tab

| Setting | Description |
|---------|-------------|
| Current Resolution | Displays active width × height @ FPS (while streaming) |
| Recheck Video Settings | Re-test all resolution/FPS combinations for the selected device |
| Resolution & Frame Rate | **Auto** (best available, up to 1080p @ 60fps) or a tested combination |
| Apply Resolution & Frame Rate Settings | Apply the selected mode and restart the stream |
| Reset display settings | Rotation, flips and fit mode back to defaults |
| Video Fit Mode | contain / fill / cover / none |
| Flip & Rotate Video | Rotate: None / 90° / −90° / 180°; Flip: Mirror (left-right), Flip upside down |
| Command Bar | Docked Command Bar / Floating Command Bar |

### Settings Tab

| Setting | Description |
|---------|-------------|
| Enable KVM keyboard & mouse control | Turn off to use the app as a plain capture-card viewer |
| Baud Rate | 9600 / 57600 / 115200 |
| Keyboard Compatible Mode | Tap keys instead of holding them, for Linux/older systems |
| Type clipboard on Ctrl+V | Ctrl+V (Cmd+V on Mac) types the local clipboard on the target (default on) |
| Auto-Open QR Code Links | Open scanned QR URLs automatically |
| Auto-Open OCR Extracted URLs | Open OCR-detected URLs automatically |
| Auto Capture Mouse | Capture mouse on click without confirmation |
| Cursor Mode | relative / absolute (default) |
| Width / Height | Absolute mouse area as a percentage of the video (10–100%, absolute mode only) |

### Macros Tab

Full macro management — see [Macros](#macros). Also contains the **Adv. Text Escape Sequence** setting: `[[ ]]` / `{{ }}` / `\|\| \|\|`.

### Advanced Tab

| Setting | Description |
|---------|-------------|
| Reset Video & Audio Devices | Stops the stream and clears saved device selections, the chosen resolution and the tested-capabilities cache |
| Reset All Settings | Restores every setting to its default (confirmation required). Device selections and macros are kept |
| About | Shows the app version, build date and edition (Web app or Desktop app) |

---

## Advanced Text Command Reference

Use these commands inside escape markers (e.g. `[[ENTER]]`). Commands are case-insensitive.

### Timing

| Command | Description |
|---------|-------------|
| `DELAY=N` | Wait N seconds (decimals supported, e.g. `DELAY=0.5`) |

### Navigation & Editing

| Command | Key |
|---------|-----|
| `ENTER` or `RETURN` | Return |
| `ESCAPE` or `ESC` | Escape |
| `TAB` | Tab |
| `SPACE` | Space bar |
| `BACKSPACE` | Backspace |
| `DELETE` or `DEL` | Delete |
| `INSERT` or `INS` | Insert |
| `HOME` | Home |
| `END` | End |
| `PAGEUP` or `PGUP` | Page Up |
| `PAGEDOWN` or `PGDN` | Page Down |
| `UP` or `ARROWUP` | ↑ |
| `DOWN` or `ARROWDOWN` | ↓ |
| `LEFT` or `ARROWLEFT` | ← |
| `RIGHT` or `ARROWRIGHT` | → |
| `MENU`, `APPS` or `CONTEXTMENU` | Context menu key |

### Function Keys

`F1` `F2` `F3` `F4` `F5` `F6` `F7` `F8` `F9` `F10` `F11` `F12` — and `F13` to `F24`

### Lock & System Keys

| Command | Key |
|---------|-----|
| `CAPSLOCK` | Caps Lock |
| `NUMLOCK` | Num Lock |
| `SCROLLLOCK` | Scroll Lock |
| `PAUSE` | Pause/Break |
| `PRINTSCREEN` or `PRTSC` | Print Screen |

### Modifier Combinations

Combine modifiers with `+`. Any single character key can be used too (e.g. `CTRL+C`, `WIN+R`):

| Modifier | Aliases |
|----------|---------|
| `CTRL` | `CONTROL` |
| `SHIFT` | — |
| `ALT` | `OPTION` |
| `WIN` | `META`, `CMD`, `GUI`, `SUPER` |
| `RCTRL` | Right Ctrl |
| `RSHIFT` | Right Shift |
| `RALT` | `ALTGR` (Right Alt) |
| `RWIN` | `RMETA` (Right Win) |

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
