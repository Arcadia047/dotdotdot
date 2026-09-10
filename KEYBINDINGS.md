# Keybindings

The everyday model is **files inside tasks**: Neovim buffers hold files, and
tmux windows hold tasks. **Ctrl-h/l moves horizontally through files;
Ctrl-k/j moves backward/forward through tasks.** Neither requires a split.
AeroSpace owns desktop focus with Alt-h/j/k/l. WezTerm hosts the terminal.

A space between keys means a sequence: `Ctrl-a l` means press Ctrl-a, release,
then press l. Neovim's leader is Space. Leader bindings start in normal mode.

## Focus and switching

| Intent | AeroSpace | tmux | Neovim |
| --- | --- | --- | --- |
| Desktop focus | `Alt-h/j/k/l` | — | — |
| Previous/next file | — | Keys pass to the application | `Ctrl-h/l` (also `[b` / `]b`) in Bufferline order |
| Previous/next task | — | `Ctrl-k/j` (also `Shift-Left/Right`) | Same keys switch **tmux windows**, in every editor mode |
| Select numbered item | `Alt-1…9/0` workspace | `Ctrl-a 1…9` window | `Space 1…9` buffer ordinal |
| Back to previous item | `Alt-Tab` workspace | `Ctrl-a Tab` window | `Space Tab` alternate buffer |
| Pick item | macOS app switcher | `Ctrl-a w` windows, `Ctrl-a s` sessions | `Space fb` buffers; `Space Space` files |

File and task cycling wraps. In insert mode, Ctrl-h/l switches files and returns
to normal mode; unsaved edits remain in their buffers. Ctrl-j/k is handled by
tmux before reaching Neovim, so task switching preserves the editor's mode and
open picker or sidebar. It also works from shells and embedded terminals.
With only one buffer or tmux window, cycling that list naturally stays put.

Buffer selection, cycling, alternate-buffer, and buffer-picker shortcuts invoked
from Neo-tree or a task panel first focus the previous/available editing window.
They do not replace the sidebar. Bufferline displays stable ordinals from its
complete ordered buffer list, including entries hidden by a narrow terminal.

## Optional splits, movement, and resize

| Intent | AeroSpace | tmux | Neovim |
| --- | --- | --- | --- |
| Focus existing pane/split | `Alt-h/j/k/l` | `Ctrl-a h/j/k/l` | `Space w h/j/k/l` (also native `Ctrl-w h/j/k/l`) |
| Split right / below | — | `Ctrl-a \|` / `Ctrl-a -` | `Space w \|` / `Space w -` |
| Move pane/split | `Alt-Shift-h/j/k/l` moves desktop window | `Ctrl-a H/J/K/L` swaps with neighboring pane | `Space w H/J/K/L` moves split to that edge |
| Enter resize mode | `Alt-r` | `Ctrl-a r` | `Space w r` |
| Resize in mode | `h/l` width −/+; `k/j` height −/+ | same | same |
| Exit resize mode | `Esc` or `Enter` (also `Alt-r`) | `Esc` or `Enter` | `Esc` or `Enter` |
| Zoom | — | `Ctrl-a z` | tmux zoom contains all editor splits |
| Reload configuration | CLI `aerospace reload-config` | `Ctrl-a R` | reopen Neovim to load the complete configuration |

Splits and new tmux windows open in the current pane's directory. Window and pane
numbers start at 1; window numbering compacts when a window is removed. The tenth
AeroSpace workspace remains 0; use tmux's window picker for windows beyond 9.

## Close the intended scope

| Key | Target |
| --- | --- |
| `Space bd` | Close Current Buffer, with an unsaved-change prompt |
| `Space w x` | Close the current editor view, retaining native unsaved-change protection |
| `Ctrl-a x` | Kill the current tmux pane, with confirmation |
| `Ctrl-a &` | Kill the current tmux task/window, with confirmation |
| `Cmd-Shift-W` | Close the current WezTerm host tab, with confirmation; normally the sole tab in its OS window |

`Ctrl-a c` creates a tmux task/window. Host tabs, panes, tab selection, and host
zoom are infrequent operations available through the WezTerm command palette
(`Cmd-Shift-P`). `Cmd-Shift-N` opens another OS terminal window.

## Key ownership and exceptions

| Context / conflict | Owner and behavior | Lower-priority operation / recovery |
| --- | --- | --- |
| WezTerm default tabs/panes vs tmux | Explicit host key whitelist; no foreground-process guessing | Native tabs/panes through command palette |
| `Cmd-T`, `Cmd-W`, `Cmd-N`, `Cmd-1…9` | Explicit no-op in WezTerm | Host management uses Cmd-Shift chords or palette |
| `Ctrl-Tab`, Ctrl/Shift terminal tab/pane defaults, Shift-arrows | WezTerm leaves these keys to the terminal app | No competing host assignment |
| zsh inside tmux | Ctrl-j/k switches tasks; Ctrl-h/l retains shell backspace/clear | Enter submits commands; `Ctrl-a Ctrl-k` sends literal kill-line |
| zsh outside tmux | Normal shell Ctrl keys | Start tmux for task switching |
| `Ctrl-a` shell start-of-line | tmux prefix | `Ctrl-a Ctrl-a` sends literal Ctrl-a |
| Neovim completion `Ctrl-k` | tmux task switching | Signature help opens automatically; normal-mode `gK` requests it |
| Overseer `Ctrl-j/k` output scroll | tmux task switching | `Ctrl-u/d` scroll output; `Ctrl-n/p` select tasks |
| Telescope floating prompt | Ctrl-j/k switches tmux tasks; Ctrl-h remains backspace | `Ctrl-n/p` selects; `Ctrl-u/d` scrolls preview; `Esc` closes before file cycling |
| Other floating editor inputs | Keep insert-mode text input | Dismiss with Esc for file cycling; Ctrl-j/k still switches tasks |
| tmux copy mode | Ctrl-j/k and Shift-arrows switch tasks | `q` exits copy mode; `v` selects, `y` copies |
| Shell fzf | tmux owns Ctrl-j/k | `Ctrl-n/p` selects; Esc/Ctrl-c dismisses |
| SSH / mosh | Ctrl-j/k switches local tmux tasks; Ctrl-h/l reaches the remote editor | Remote buffer shortcuts require the same Neovim config; use the remote tmux prefix for remote tasks |
| Nested remote tmux with Ctrl-a prefix | First prefix belongs to local tmux | `Ctrl-a Ctrl-a` sends prefix to remote; then remote command |

WezTerm retains `Cmd-C/V` clipboard, `Cmd-F` scrollback search, `Cmd-+/-/0`
font size, `Cmd-H/M` hide/minimize, and Option-Left/Right shell word motion.
`Cmd-Shift-R` reloads WezTerm; `Cmd-Shift-K` clears its scrollback without sending
Ctrl-l into Neovim. Ctrl-T remains available for the shell fzf file picker.
WezTerm search/copy/palette overlays are modal host utilities; Escape closes them
before returning to terminal navigation.

## Neovim workflow shortcuts

| Key | Action |
| --- | --- |
| `Space e` / `-` | Toggle file tree / reveal current file in tree |
| `Space Space` / `Space /` / `Space fb` | Find files / live grep / buffers |
| `Space bp` / `Space bc` | Pin buffer / close other buffers |
| `Space cd` / `Space xx` | Diagnostic float / diagnostic list |
| `Space ca` / `Space cf` | Preview code action / format |
| `Space gg` | LazyGit in a temporary editor tab; use its own quit key to return |
| `Space rr` / `Space ro` | Run current context / task output |
| `Space sl` / `Space ss` | Restore / select editor session |
| `Space D` | Debugger commands |

Which-key displays the leader groups, including `Space w` for editor windows.
`Space b` shows **Close Current Buffer** on `d`. Neo-tree leaves Space available
to the leader menu; Enter still opens files and toggles folders.

## Verification

`python3 tests/navigation.py` drives actual terminal bytes through an attached
PTY client into a private tmux server and the full Neovim configuration. It uses
installed plugins and temporary config/state/cache directories. It covers buffer
cycling without splits, unsaved edits, Neo-tree, modal escape, embedded terminals,
copy mode, and task switching. Optional editor focus remains tested.
It never attaches to an existing tmux session. `./scripts/check` covers the host
key whitelist and the remaining configuration contracts.
