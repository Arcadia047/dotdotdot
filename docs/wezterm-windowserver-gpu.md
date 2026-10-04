# WezTerm idle WindowServer GPU diagnosis

Observed and fixed locally on 2026-09-12.

## Confirmed cause and fix

Enabling the shadow on this WezTerm window triggers sustained GPU work in macOS WindowServer even when WezTerm makes no new GPU submissions. Disabling only that shadow removes the spike. Re-enabling it reproduces the spike; disabling it again removes it. This identifies the native window-shadow compositing path as the cause, independently of terminal output or the OpenGL/Metal choice.

```lua
config.window_decorations = "TITLE | RESIZE | MACOS_FORCE_DISABLE_SHADOW"
```

This keeps the title bar, resizing, full opacity, display scaling, and 120 Hz refresh rate. It removes only WezTerm's drop shadow. The setting applied through configuration reload without restarting WezTerm or tmux during the comparison.

## Controlled comparison

- macOS 26.6.2 (25G83), Apple M1 with 7 GPU cores.
- WezTerm 20260909-081506-9fa147c9; the same Metal GUI process (PID 80522) in all four stages.
- BenQ RD280UG, macOS render resolution 5120 x 3414, UI 2560 x 1707 at 120 Hz.
- Same workspace 3, same terminal contents and tmux session, same accompanying Activity Monitor window.
- Identical terminal geometry in every stage: 2496 x 3233 pixels, 104 columns x 61 rows, reported DPI 144.
- Three seconds to settle after each configuration change, then four approximately two-second samples per stage.
- Each percentage is the change in the process's `IOAccelerator` `AppUsage.accumulatedGPUTime` divided by elapsed monotonic time. These are process GPU-time rates, not instantaneous whole-device utilization readings.
- WezTerm submitted no new GPU work in all samples except one 0.17% sample during shadows-on. Its earlier idle stack sample also showed its main thread waiting for events.

| Shadow state | WindowServer samples | Mean |
| --- | --- | --- |
| baseline | 51.65%, 55.14%, 52.15%, 52.73% | 52.92% |
| shadows_off | 2.16%, 2.32%, 1.99%, 1.99% | 2.12% |
| shadows_on | 62.70%, 51.24%, 54.80%, 55.60% | 56.09% |
| shadows_off_confirm | 1.69%, 2.00%, 1.80%, 1.61% | 1.77% |

The prior Metal renderer switch alone left WindowServer at 53–62%, comparable to the original OpenGL result of 52–59%. The shadow test held Metal fixed and reversed the outcome twice. Display refresh rate and scaling were not changed.

A final check with WezTerm expanded to fill the display and shadows disabled measured WindowServer at **0.71–1.58%** over five two-second samples. The equivalent earlier shadow-enabled full-window test measured **86–94%**. Activity Monitor and the original workspace were restored afterward.

## Source-level explanation and limits

In the exact build's macOS implementation, `update_window_shadow` enables `NSWindow.hasShadow` for an opaque terminal by default. The override above directly calls `setHasShadow(NO)`. Configuration reload calls this method immediately. The same file supplies a clear native window background for the opaque case and nonopaque content layers; its background-color comment describes the special content-derived shadow path for zero-alpha backgrounds. These details explain why app rendering can be idle while native window composition remains expensive.

The local experiment establishes the shadow-path trigger and effective workaround. It does not identify Apple's private shader or prove its internal cache invalidation algorithm. A related Tahoe shadow regression was worked around in VS Code; Electron subsequently fixed its own trigger by removing a private corner-mask override. WezTerm is not Electron and that specific override should not be attributed to it.

Sources:

- [Exact WezTerm build: native background color](https://github.com/wezterm/wezterm/blob/9fa147c9/window/src/os/macos/window.rs#L62)
- [Exact WezTerm build: shadow selection](https://github.com/wezterm/wezterm/blob/9fa147c9/window/src/os/macos/window.rs#L1147)
- [WezTerm shadow option](https://wezterm.org/config/lua/config/window_decorations.html)
- [VS Code's Tahoe window-shadow workaround](https://github.com/microsoft/vscode/pull/267724)
- [Electron's separate corner-mask fix](https://github.com/electron/electron/pull/48376)

## Current titlebar configuration

The current config also includes `MACOS_USE_BACKGROUND_COLOR_AS_TITLEBAR_COLOR`,
which matches the native titlebar color to the terminal background. This is a
[nightly-only flag](https://wezterm.org/config/lua/config/window_decorations.html)
and accompanies `TITLE | RESIZE`. The installed
`20260909-081506-9fa147c9` CLI successfully parsed the full rendering configuration
with `wezterm --config-file <checkout>/wezterm/wezterm.lua show-keys --lua` during
commit preparation. That confirms option compatibility, not a new visual or
GPU measurement. The controlled shadow comparison above predates this flag.

## Recheck after updates

Compare the same idle visible window with `MACOS_FORCE_ENABLE_SHADOW` and `MACOS_FORCE_DISABLE_SHADOW`; keep all other settings and window geometry fixed. Use short GPU-time deltas from `ioreg -r -c IOAccelerator -l`, pairing each `AppUsage` entry with `IOUserClientCreator`. Record workspace and geometry to avoid a hidden-window comparison. Restore `MACOS_FORCE_DISABLE_SHADOW` after the check if the spike returns. No synthetic unit test can establish the behavior of this live macOS compositor.
