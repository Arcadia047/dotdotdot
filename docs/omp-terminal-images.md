# OMP image placement through WezTerm and tmux

## Symptom and diagnosis

Reported on 2026-10-15: images were partially recognizable, fragments appeared
in unrelated positions including tmux's status bar, and scrolling text made
placement worse.

Installed stack at diagnosis:

- WezTerm `20260909-081506-9fa147c9`.
- tmux `3.7c`, built with native SIXEL (`#{sixel_support}` returned `1`).
- Oh My Pi `18.4.1`.
- Live WezTerm client advertised `sixel`; `allow-passthrough` was already `on`.
- The shell prompt is Powerlevel10k; `omp` is the Oh My Pi harness.

OMP selects Kitty graphics for WezTerm and wraps graphics commands in tmux
passthrough. Those commands bypass the pane's image grid. The outer terminal
places them at its cursor while tmux separately scrolls, clips and repaints text.
Tmux cannot reconstruct those images when it redraws its panes. This mismatch
explains the reported scattering and status-bar overlap; enabling passthrough
again does not give tmux ownership of the image.

## Reproduction and fix

`python3 tests/terminal_images.py` replays a synthetic PNG returned by a read
tool through the installed OMP renderer in a private tmux PTY. Before the fix:

```text
OMP startup: 2 Kitty transmit/placement commands, 0 SIXEL images
AssertionError: tmux owns and redraws the OMP image: tmux cannot redraw the image;
OMP bypassed its image grid (Kitty placements at startup: 2)
```

`zsh/omp.zsh`, sourced by `.zshrc`, selects SIXEL only when a launch is in tmux,
the attached client identifies as WezTerm and advertises SIXEL, and the server
reports native SIXEL support. This uses OMP's supported
`PI_FORCE_IMAGE_PROTOCOL` interface, scoped to the child invocation. Explicit
nonempty overrides are preserved. The check is repeated for each launch because
tmux sessions can outlive their attaching terminal. An inherited `WEZTERM_PANE`
alone does not establish which terminal is now attached.

With the adapter the same reproduction emitted zero Kitty transmit/placement
commands and native SIXEL images. Tmux retained image data across its own redraw,
window switches, copy-mode scrolling and split-pane resizing. Emitted image
rectangles stayed inside the pane and above the status bar. The exact image
count varies with startup/repaint timing and is not the pass criterion.

The regression independently decodes samples from the emitted SIXEL raster and
checks all four solid color regions of the synthetic image. Its `--stream` mode
also feeds a synthetic OpenAI-compatible SSE response from a loopback-only HTTP
server through real OMP. Sixty text blocks streamed past the image; once it left
the viewport, a tmux redraw contained no stale image placement. This mode uses a
temporary custom provider with no authentication, not a real provider account.
Add `--tall` to repeat the same checks with a 540 × 1440 source image, taller
than the test's 960 × 720 pixel viewport, exercising OMP's image fitting and
tmux's clipping through the same scrolling and split-pane cases.

The focused launch-policy tests also check argument/exit-status preservation,
process-local environment scope, explicit overrides, other terminals, missing
capabilities and stale WezTerm markers:

```sh
python3 -m unittest discover -s tests -p 'test_omp_images.py' -v
python3 tests/terminal_images.py --stream
python3 tests/terminal_images.py --stream --tall
```

`python3 tests/terminal_images.py --baseline` bypasses the adapter and is expected
to fail the ownership assertion with OMP 18.4.1. Both paths use disposable homes,
sessions and sockets, allowlist their environment, disable startup update checks,
and send no external model requests. Only `--stream` starts the loopback fixture
server. The test does not attach to the user's tmux server.

The exported staged checkout passed all 22 repository tests (the working tree
also passed its 24 tests, including two unrelated pending tests). Real-PTY shell
completion and theme-transition checks passed. The machine doctor passed with
its existing warning about modified tmux plugin submodules. A harmless recording
executable substituted for OMP also confirmed the adapter selects SIXEL using
the **actual attached WezTerm client's** capability metadata.

## Apply and accept visually

In an existing shell:

```sh
source ~/.zshrc
```

Save/exit the affected OMP process, then relaunch/resume it with `omp`. Existing
processes cannot acquire a changed environment. `command omp`, an absolute
binary path and noninteractive scripts bypass this interactive-shell adapter.

1. Display the same image using OMP's read/browser result.
2. Scroll while text is appearing; switch tmux windows and return.
3. Enter/leave tmux copy mode, split/resize the pane, and repeat with an image
   taller than the visible transcript area.
4. Confirm recognizable image content, aligned text, clean neighboring panes,
   and no image fragments in the status bar.

If old graphics remain after exiting OMP, use WezTerm's existing
`Cmd-Shift-K` clear-scrollback action deliberately; it removes terminal scrollback.
The automated checks never clear a user's terminal.

The PTY test simulates WezTerm's identity and checks tmux's real outgoing image
data, pixel samples, clipping and actual OMP streaming from local fixture data.
It does **not** establish native WezTerm window pixel appearance. Native visual
acceptance was unavailable because the computer-use tool blocked WezTerm.
No terminal/server restart,
package upgrade, OMP settings rewrite or change to user sessions was performed.

Tmux 3.7c clips native images as they scroll and frees them when fully outside
the screen; SIXEL is not a permanent graphics archive in copy-mode history.
Reopen/replay the image in OMP to draw it again. The scrolling regression checks
that the image moves out cleanly without leaving fragments, and separately that
copy-mode entry/exit restores an image that is still in the pane's live grid.

If tmux lacks SIXEL or the client does not advertise it, the adapter leaves
OMP's detection alone. On such a stack use OMP's `/settings` to disable inline
images while investigating support rather than forcing an unsupported protocol.

## Source references

- [OMP 18.4.1 terminal selection and graphics encoding](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/terminal-capabilities.ts).
- [OMP 18.4.1 Kitty placement policy](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/kitty-graphics.ts).
- [OMP 18.4.1 image environment overrides](https://github.com/can1357/oh-my-pi/blob/v18.4.1/docs/environment-variables.md).
- [tmux 3.7c image storage, scrolling and clipping](https://github.com/tmux/tmux/blob/3.7c/image.c).
- [WezTerm image protocol support](https://wezterm.org/imgcat.html).
