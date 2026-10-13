# Changelog

All notable changes to the KitBash KVM Controller are documented here.
Versions follow [Semantic Versioning](https://semver.org/): **MAJOR** for breaking changes,
**MINOR** for new features, **PATCH** for fixes. The version lives in `package.json` and is
used by the web app (Settings > Advanced > About) and the desktop installers.

## [2.3.1] - 2026-10-13

### Changed
- Settings: the "Settings" tab is renamed "General".

## [2.3.0] - 2026-10-13

### Added
- Built-in **Default** macro category: always present, can't be renamed or deleted, and new macros
  go into it unless another category is chosen (or is being viewed). Macros saved without a
  category, and those from older exports, are moved into it; deleting a category moves its
  macros there. An imported category named "Default" is merged into it.
- **Add Category** button in Macro Management (replaces the inline name field).

### Changed
- "Uncategorized" is gone from the macro editor, category filter and command bar menu. The Macros
  menu lists macros directly when only one category is in use.
- Settings > Video fits without scrolling: rotate and flip options are laid out in rows, and the
  settings panel uses up to 88% of the window height (max 760px).

## [2.2.1] - 2026-10-13

### Changed
- Settings: each baud rate option is captioned with the KVM it is the default for: 9600
  "KitBash KVM Default", 57600 "Sipeed USB KVM Default", 115200 "Other".

## [2.2.0] - 2026-10-13

### Added
- An auto-selected KitBash capture card also sets the KVM baud rate: 57600 for the
  "USB2 Video" card, 9600 for the "USB Video" card.

## [2.1.0] - 2026-10-13

### Added
- On start, a plugged-in KitBash capture card is selected automatically (overriding the last-used
  devices): "USB2 Video" + "Digital Audio Interface (USB2 Digital Audio)" first, then "USB Video" +
  "Digital Audio Interface (USB Digital Audio)". The card's own audio entry is preferred over
  Chrome's "Default - …" alias.

## [2.0.3] - 2026-10-13

### Fixed
- Esc now cancels a screenshot, OCR or QR area selection in fullscreen too (the keyboard is locked
  while selecting, so the browser doesn't consume Esc to leave fullscreen).

### Changed
- OCR and QR area selections use the same menu-blue crosshair and selection box as screenshots.
- Serial (KVM) connect/disconnect icons are now a DB-9 serial connector instead of a power plug.

## [2.0.2] - 2026-10-13

### Changed
- Command bar tooltips support a second, smaller hint line; the screenshot button shows
  "(Shift+Click for full screen)" on its own line.

## [2.0.1] - 2026-10-13

### Fixed
- Area screenshot: the selected rectangle is no longer dimmed or tinted; only the area outside it is
  darkened, so the selection shows exactly what will be captured.

## [2.0.0] - 2026-10-13

First versioned release of the rebuilt controller (previous builds were 0.1.x).

### Added
- Macro categories: create, rename and delete; category field in the macro editor; category
  filter under the macro search; categories as sub-menus in the command bar's Macros menu.
  Exports include categories, and older exports import into a "Default" category.
- Ctrl/Cmd+V types the local clipboard on the target (Settings toggle); Ctrl+Shift+V is always a
  normal keystroke.
- Hold Esc for 1 second to release keyboard and mouse; a tap of Esc is sent to the target.
- Keyboard Lock in fullscreen, so shortcuts like Ctrl+W reach the target.
- Resolution "Auto" mode (best available up to 1080p @ 60fps) and per-device chosen modes.
- Video and audio resume automatically when the capture device is reconnected.
- CH9329 presence check on connect (warns about a likely wrong baud rate), disconnect detection,
  and a stop button for long text/macro sends.
- Command bar: Docked or Floating layout setting, themed tooltips, green live-source icons.
- Settings: "Reset All Settings", "Reset display settings", About section with version info.
- New icon set (`scripts/generate-icons.py`) and logo-blue theme for the bar, menus, dialogs and
  notifications.

### Changed
- Capture devices open at the best mode up to 1080p60 instead of Chrome's 640x480 default.
- Keyboard input uses physical keys with full multi-key reports (fixes non-US layouts, CapsLock,
  AltGr and stuck keys).
- Screenshot button: plain click selects an area, Shift+Click captures the full frame.
- Screenshots, OCR, QR and absolute mouse follow rotation, flips and fit mode.
- Key presses aren't sent to the target while the pointer is over the command bar or a menu.
- Desktop (Tauri) builds go to `dist-tauri/`, so they never overwrite the web build in `dist/`.
- Project uses yarn only; `moment`, `vue-router` and `@vitejs/plugin-vue-jsx` removed.

### Fixed
- Relative mouse drift, lost clicks in absolute mode, scroll wheel handling, stuck mouse buttons.
- Serial write overlap, port open timeout handling, Volume Up/Down swap.
- Memory leaks in recording, notifications and OCR; offline PWA icons.
- Desktop app detection (pin-on-top and fullscreen buttons) and links opening in the system browser.

### Removed
- Color filter presets, custom CSS filter and the native video controls option.
