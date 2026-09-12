# dotdotdot

A hand-owned Apple Silicon macOS development environment: AeroSpace → WezTerm → tmux → Neovim. Stability and discoverability lead; tmux owns persistent terminals, Neovim owns source-code work, and VS Code remains the rich-notebook exception. Keep local preferences and credentials outside Git.

[Keybindings](KEYBINDINGS.md) · [First-use language tools](LANGUAGE_TOOLS.md) · [Design and historical acceptance](DEVELOPMENT_ENVIRONMENT_PLAN.md) · [Language research](LANGUAGE_TOOLING_RESEARCH.md)

## Install and check

```sh
./bootstrap.sh --dry-run --install
./bootstrap.sh --install
./scripts/check
./bootstrap.sh --check
```

Bootstrap backs up conflicting paths before linking. It seeds a **regular machine-local** `${XDG_CONFIG_HOME:-~/.config}/dotfiles-theme` from `theme.conf`. On existing installations it backs up the old symlink and preserves its selected mode. Running bootstrap twice leaves links and theme state unchanged.

`./scripts/check` runs syntax/style checks and disposable-home regression tests for navigation, Java selection, theme migration/switching, bootstrap idempotence, and submodule reporting. It needs Python, Neovim, ShellCheck, StyLua, and shfmt (Brewfile plus Mason). It does not run project code or affect live sessions.

`./bootstrap.sh --check` inspects this machine's commands, package declarations, links, theme state, Java selection, and pinned submodules. Uninitialized/conflicted/wrong-revision submodules fail; local submodule edits are reported as warnings and preserved. A successful doctor establishes installation state, not GUI key delivery or language-server/debugger acceptance.

## WezTerm nightly and navigation

The Brewfile selects `wezterm@nightly`. To migrate an existing stable installation:

```sh
./scripts/use-wezterm-nightly
```

The helper downloads nightly first, replaces the stable cask without removing preferences, and reinstalls stable if nightly installation fails. Existing WezTerm processes keep their old executable; save terminal-only work and relaunch WezTerm when ready. tmux sessions live independently of the terminal app.

Nightly updates are deliberate:

```sh
brew upgrade --cask wezterm@nightly --greedy-latest
wezterm --version
```

[Upstream Homebrew instructions](https://wezterm.org/install/macos.html#homebrew). The nightly cask uses `latest`, so the installed build shown by `wezterm --version` is the useful version record.

- `Ctrl-h/l` cycles Neovim file buffers, including from Neo-tree. No split is needed.
- `Ctrl-k/j` switches previous/next tmux windows from Neovim, shells, or pickers. `Shift-Left/Right` remains an alias; `[b` / `]b` remains a buffer alias.
- WezTerm's explicit host whitelist leaves terminal navigation alone. `Cmd-Shift-P` opens its command palette; `Cmd-T/W/N` and `Cmd-1…9` are no-ops.
- `Ctrl-a h/j/k/l` always selects a local tmux pane; `Space w h/j/k/l` stays inside Neovim. See [keybindings](KEYBINDINGS.md) for mode exceptions and literal shell keys.

Run the full navigation acceptance separately (requires tmux and installed Neovim plugins):

```sh
python3 tests/navigation.py
```

It sends real key bytes through a PTY attached to a private tmux server and the full editor configuration, with temporary editor state. This exercises key dispatch rather than calling navigation commands directly. It does not test macOS hardware event delivery or a remote SSH server.

## Shell completion

Tab inserts a visible grey autosuggestion without executing it. With no visible
suggestion, Tab uses normal fuzzy completion. Ctrl-F remains an acceptance alias.
The custom Tab widget is excluded from zsh-autosuggestions wrapping so it can
read the suggestion before the plugin clears it.

Run `python3 tests/shell_completion.py` for actual-key acceptance with installed
shell plugins and disposable history. After updating shell settings, run
`source ~/.zshrc` in existing shells or open a new tmux window.

## Java policy

One resolver (`nvim/lua/config/java.lua`) serves Neovim and bootstrap. It reads executable JDK homes and their `release` metadata, preserves custom/unversioned paths, and rejects missing explicit choices.

Copy `zsh/machine.example.zsh` to `${XDG_CONFIG_HOME:-~/.config}/dotdotdot/machine.zsh` to customize:

- `DOTDOTDOT_JAVA_VERSION`: optional Neovim project/standalone default. Otherwise use `JAVA_HOME`, then the newest installed JDK. Project Maven/Gradle toolchains remain authoritative.
- `JAVA_HOME`: optional shell-wide runtime, including custom paths. The shared shell configuration does not invent this setting.
- `DOTDOTDOT_JDTLS_JAVA_VERSION`: optional independent language-server runtime. Otherwise use the newest installed JDK; Java 21+ is required by the installed jdtls launcher.

For a Java 17 project with jdtls on Java 25, install both JDKs and export the two version preferences as 17 and 25 respectively. A nonexistent requested JDK is an error, never a silent fallback. Machine-only JDK packages can live in `Brewfile.local` alongside the machine profile.

## Theme state

`theme dark` / `theme light` atomically changes the local state file without writing into this checkout. WezTerm watches that file; existing tmux sessions refresh even when the command is issued outside tmux; Neovim refreshes on focus and reads it on startup. The file overrides inherited `DOTFILES_THEME` for **both** modes. The environment is only a fallback when the file is unavailable or invalid.

`theme.conf` is the tracked first-install default, not mutable session state. The old theme symlink is retained in `~/.dotfiles-backups/<timestamp>/` during migration.

## Verify changes and updates

1. Run `./scripts/check`, then `./bootstrap.sh --check`.
2. Check `wezterm --version` and `wezterm show-keys --lua` after a terminal update.
3. Run `python3 tests/navigation.py`. In WezTerm verify `Cmd-T/W` do nothing, `Cmd-Shift-P` opens the palette, and `Ctrl-T` still opens shell fzf. Test `Alt-r` resize mode and Escape on the desktop.
4. Switch light → dark from both inside and outside tmux. Check all three apps after refocusing Neovim; `git diff -- theme.conf wezterm/wezterm.lua` must remain unchanged by the switch.
5. Open a Java project and check the attached jdtls client's `cmd_env.JAVA_HOME`, project runtime, completion, and a main-class debugger session. Repeat language acceptance only for tooling changed by an update.

Use `./scripts/benchmark-startup` for repeated shell/editor startup measurements. It redirects transient state to a temporary directory, skips tmux auto-start, and preserves installed plugin data. Caches are warmed in the temporary directory. The shell measurement excludes machine-local interactive overrides; the report names that boundary. Compare medians on the same machine before considering performance changes.

Plugin commits are recorded in `nvim/lazy-lock.json` and tmux submodules. Homebrew and Mason tool versions are not fully locked; installation consistency is not a promise of byte-for-byte reproducibility. Review upgrades intentionally and record the actual build plus acceptance results. Dated results in the design document describe earlier versions.

## Verification record — 2026-09-09

- Installed Homebrew `wezterm@nightly`, build `20260909-081506-9fa147c9`; parsed the actual nightly key table.
- `./scripts/check`: 9 integration tests and 14 Lua behavior checks passed, including failed-download protection and failed-install rollback for the nightly migration helper.
- Machine doctor passed with a warning for the two pre-existing modified tmux submodules; their changes were preserved.
- A disposable nightly GUI exercised the real Pane callbacks: bare-shell tab navigation, direct Neovim key delivery, and WezTerm → isolated tmux → Neovim key delivery passed. Shell `Ctrl-T` resolves to `fzf-file-widget`.
- Atomic light/dark state replacement triggered WezTerm hot reload. A private tmux server refreshed both palettes from outside tmux, and configured Neovim refreshed both palettes on focus.
- Live jdtls attached on this machine's selected launcher (Java 26), returned 44 completion candidates, and discovered the fixture's main class. The project default remains Java 25. Full debugger execution was not rerun in this change.
- Seven warm starts: zsh median 98 ms (97–100 ms), Neovim median 68 ms (66–72 ms), using the benchmark boundaries above. These are a local baseline, not GUI latency measurements.


## Earlier pane-navigation acceptance — 2026-09-10

This historical pane model is superseded by the buffer/task model in [KEYBINDINGS.md](KEYBINDINGS.md).

- `python3 tests/navigation.py`: **49 actual-key integration checks passed** against the repository configuration. Coverage includes both directions between Neo-tree, editor splits, and tmux; all four tmux boundaries; narrow-pane buffer ordinals; buffer cycling and picking from Neo-tree; insert mode; embedded terminals; Overseer; copy mode; task switching; resize-mode exits; and both ordinary and explicit navigation while zoomed.
- The baseline reproduced Shift-Right staying inside Neovim. Expanded checks also caught Bufferline's visible-only numbering and tmux's zoom-dependent edge flags; the final behavior uses full-list buffer ordinals and explicitly unzooms for prefix focus.
- `./scripts/check`: 9 configuration tests and 10 Lua checks passed. The actual installed WezTerm nightly parsed the final host key whitelist.
- AeroSpace configuration validation and reload succeeded. Its live resize-mode entry and both Escape/Enter exits passed through `trigger-binding`; no window geometry was changed by that check.
- Live tmux key tables were verified after reload. All 5 sessions, 9 window links, 9 pane/process identities, and active window selections were preserved while migrating existing windows to one-based numbering.
- Machine doctor passed with the same pre-existing modified-submodule warning. New Neovim instances load the complete mappings; already-running editors were not restarted. Hardware/macOS event delivery and remote SSH configuration are outside the automated PTY test.


Language tools now install on first opening a configured filetype; see
[LANGUAGE_TOOLS.md](LANGUAGE_TOOLS.md) for supported types, CUDA build requirements,
status/retry commands, and fresh-install verification. Neo-tree no longer captures
Space, so Which-key's `Space b` menu shows **Close Current Buffer** (`Space b d`).


## Buffer/task navigation acceptance — 2026-09-10

- `Ctrl-h/l` cycles Neovim buffers; `Ctrl-k/j` cycles tmux windows. Split focus is available through explicit prefixes. The unused Neovim tmux-navigator plugin has been removed from the configuration.
- `python3 tests/navigation.py`: **44 actual-key integration checks passed**, starting with three file buffers and one editor view. Coverage includes insert mode, unsaved edits, buffer closing, Neo-tree preservation, Which-key, Telescope, Overseer, embedded terminals, copy mode, and numbered/alternate task selection.
- The same test against the earlier pane configuration reproduced Ctrl-l doing nothing with a single editor view. The new configuration switches to the next buffer.
- `./scripts/check` passed: 10 Python configuration tests, 10 Lua configuration checks, and 5 tooling behavior checks. PTY acceptance covers terminal key dispatch; macOS hardware events and remote configurations remain outside this test.
