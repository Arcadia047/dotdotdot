# Oh My Pi integration

## Images in tmux

`zsh/omp.zsh` selects `PI_FORCE_IMAGE_PROTOCOL=sixel` for an `omp` launch when
the attached client identifies as WezTerm, advertises SIXEL, and the tmux server
reports `sixel_support=1`. The choice applies only to that child process. Explicit
`PI_FORCE_IMAGE_PROTOCOL` values win; other terminals and direct launches keep
OMP's own detection. The adapter queries the current pane's attached client each
time rather than trusting an inherited `WEZTERM_PANE` marker.

OMP 18.4.1 otherwise selects cursor-based Kitty graphics for WezTerm. Its tmux
passthrough bypasses tmux's image grid, so pane scrolling/reflow can leave image
fragments or paint over the status bar. SIXEL gives tmux ownership of image
storage, clipping and redraw. Global passthrough stays enabled for other uses;
enabling it alone does not solve image positioning.

Existing shells need `source ~/.zshrc`, then OMP must be relaunched (save/exit and
resume the session as usual). `command omp` bypasses the shell adapter.
Already-running processes retain their launch environment. Keep
`terminal.showImages: true` in OMP's settings. Do not force Kitty placeholders
or change `TERM` to impersonate the outer terminal inside tmux.

Run `python3 tests/terminal_images.py` for the installed OMP/private-tmux replay.
It checks image redraw, window switching, copy-mode scrolling, split-pane reflow,
image pixel content, and bounds relative to the pane/status bar. Add `--stream`
to drive 60 streamed text blocks through OMP using a loopback-only fixture server.
Repeat with `--stream --tall` for a source image taller than the viewport.
It uses temporary state and a synthetic image without provider credentials or
external model calls. The terminal's identity reply is simulated;
native WezTerm pixel appearance remains a separate
visual check. See [diagnosis and acceptance](../docs/omp-terminal-images.md).

## Theme

`dotdotdot-rose-pine-dawn.json` adapts Oh My Pi 18.4.1's bundled
[dark-rose-pine theme](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/theme/defaults/dark-rose-pine.json)
to the official [Rosé Pine Dawn palette](https://rosepinetheme.com/palette/).
It defines every required token in that version's
[theme schema](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/theme/theme-schema.json).
The role values must match `theme/palette.tsv`; `tests/test_palette.py` checks
all variables and every color/export reference so this packaged asset cannot
drift silently. Text and tool output use Dawn's text color; secondary text uses subtle for
readability on the light surfaces. Error panels use the overlay surface with
Love accents rather than retaining the dark theme's hardcoded background.

Bootstrap links the theme into `${PI_CODING_AGENT_DIR:-~/.omp/agent}/themes`
only when `omp` is installed. It does not replace OMP's settings directory,
credentials, extensions, or sessions. OMP's native CLI sets the slots:

```sh
omp config set theme.light dotdotdot-rose-pine-dawn
omp config set theme.dark dark-rose-pine
```

Named OMP profiles have separate settings and theme directories. To use this
theme there, link this JSON into that profile's `agent/themes` directory and
run the same commands with `OMP_PROFILE=<name>`. Dotfiles configure the default
profile only; they do not modify unrelated profiles or the separate `pi` app.

OMP follows OSC 11 background replies, with `COLORFGBG` as its fallback. The
shared `theme auto|light|dark` command and startup config export matching values.
In auto mode, WezTerm follows macOS and OMP's native appearance observer
rechecks the terminal background to select the configured light/dark slot.
Already-running OMP sessions can change their light/dark theme slots through
`/settings`; fresh sessions read the persisted settings.

Upstream Oh My Pi theme source: MIT license. See LICENSE for the full upstream
copyright and permission notice.
