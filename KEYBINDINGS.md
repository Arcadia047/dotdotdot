# Universal Keybindings

One navigation model across every layer. **The innermost running layer claims
the gesture**: a key pressed in Neovim drives Neovim, in tmux drives tmux, on a
bare shell drives WezTerm, on the desktop drives AeroSpace.

```
AeroSpace (OS)  ⊃  WezTerm (terminal)  ⊃  tmux (sessions)  ⊃  Neovim (editor)
```

## The model in one sentence

> **hjkl** = move focus among visible panes · **Shift+←/→** = previous/next
> tab·window·buffer · **numbers** = jump to item N · **Shift+hjkl** = move the
> item itself (AeroSpace) · **alt-tab / prefix-a / leader-Tab** = back to the
> previous item.

Modifier = layer: **Alt** is AeroSpace's (OS layer), **Cmd** is WezTerm's
(macOS convention), **Ctrl** is pane focus inside terminals, **prefix/leader**
belong to tmux/Neovim. Because each layer owns a different modifier, nothing
collides.

## Gesture → binding per layer

| Gesture                 | AeroSpace                        | WezTerm                     | tmux (`prefix` = `C-a`)                         | Neovim (`leader` = `space`)                       |
| ----------------------- | -------------------------------- | --------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Focus pane/window ←↑↓→  | `alt-hjkl`                       | `Ctrl-hjkl`¹                | `Ctrl-hjkl`                                     | `Ctrl-hjkl`                                       |
| Previous / next sibling | `alt-h` / `alt-l` cycles windows | `Shift+←` / `Shift+→` (tab) | `Shift+←` / `Shift+→` (window)                  | `Shift+←` / `Shift+→` (buffer); aliases `[b` `]b` |
| Jump to item N          | `alt-1..9` (workspace)           | `Cmd+1..9` (tab)            | `prefix+1..9` (window)                          | `leader+1..9` (buffer)                            |
| Back to previous item   | `alt-tab` (workspace)            | —                           | `prefix+a` (last window)                        | `leader+Tab` (alternate buffer)                   |
| Split                   | —                                | `Ctrl+t` (new tab)          | `prefix+\|` side-by-side, `prefix+-` top/bottom | `leader+\|` split right, `leader+-` split below   |
| Close current item      | `Cmd+w`                          | `Cmd+w` (tab)               | `prefix+&` (window)                             | `leader+bd` (buffer)                              |
| Move item               | `alt-shift-hjkl` (window)        | —                           | —                                               | —                                                 |
| Maximize / zoom         | —                                | —                           | `prefix+m` (zoom pane)                          | —                                                 |

¹ _WezTerm's `Ctrl-hjkl`/`Shift+←→` bindings only fire on bare shells. When
tmux or Neovim is the foreground process, WezTerm forwards the raw key so the
inner layer handles it (see `wezterm/wezterm.lua`). tmux likewise passes
`Shift+←→` through to Neovim via an `if-shell` guard in `.tmux.conf`._

## tmux session / window / pane cheat sheet

| Key                      | Action                                               |
| ------------------------ | ---------------------------------------------------- |
| `prefix a`               | last window (back-and-forth)                         |
| `prefix \|` / `prefix -` | split right / below                                  |
| `prefix m`               | toggle pane zoom                                     |
| `prefix r`               | reload config                                        |
| `prefix s` / `prefix w`  | session picker / window picker                       |
| `Ctrl-hjkl`              | move between panes (also crosses into/out of Neovim) |

## Neovim leader map (which-key shows these in-app)

| Key                       | Action                                                  |
| ------------------------- | ------------------------------------------------------- |
| `leader space`            | find files · `leader /` live grep · `leader fb` buffers |
| `leader e` / `-`          | file tree toggle / reveal current file                  |
| `leader 1..9`             | go to buffer N · `leader bd` delete buffer              |
| `leader \|` / `leader -`  | split right / below                                     |
| `leader cd` / `leader xx` | diagnostics float / trouble list                        |
| `leader ca`               | code action (preview) · `leader cf` format              |
| `leader gg`               | lazygit · `leader hs/hr/hp…` git hunks                  |
| `leader rr` / `leader ro` | run current context / task output                       |
| `leader sl` / `leader ss` | restore / select session                                |
| `leader D`                | debug (DAP)                                             |
