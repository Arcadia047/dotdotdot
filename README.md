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

WezTerm uses native Metal (`front_end = "WebGpu"`) and disables its macOS window shadow while retaining the title bar and resizing. A controlled live test isolated the idle WindowServer GPU spike to shadows: about 53–56% with shadows enabled versus 2% disabled, at unchanged 120 Hz. Metal alone did not fix it. See [diagnosis and evidence](docs/wezterm-windowserver-gpu.md). Renderer changes require relaunching the GUI; tmux sessions persist independently.

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

## Terminal copying

Mouse-drag terminal output, release, then press `y` or Enter to copy and exit
tmux copy mode. `Cmd-V` then pastes into the application. `.tmux/copy.conf`
refreshes the selected range at mouse release; otherwise a fast drag can copy
only the first one or two characters. It preserves rectangular selection too.

`python3 tests/clipboard.py` verifies seven cases through a private tmux PTY and
captures OSC 52 clipboard messages without touching the system clipboard. The
old configuration reproduced a two-character copy; the fixed configuration
passes fast, reverse, multiline, rectangle, keyboard, and immediate-paste checks.

## Shell workflow

Native zsh owns paths, editing, completion semantics, and history. fzf/fzf-tab
provide search menus; zsh-autosuggestions offers advisory history hints.

- **Tab** completes the current word. Multiple candidates open a fuzzy menu;
  Enter inserts the selected candidate, and a second Enter runs the command.
  Tab behaves the same whether a grey hint is visible or still arriving.
- **Right** at the end accepts the grey history hint. **Ctrl-F** moves forward
  inside a command and accepts a hint at the end. Hints never execute commands.
- **cd** uses native zsh paths and options. Complete a partial directory with
  Tab; ambiguous prefixes require selection. **z** explicitly jumps to a learned
  directory; **zi** opens the learned-directory picker.
- **Up/Down** recalls this shell's history, searching by the prefix already typed.
  **Ctrl-R** searches the shared history, including commands from other open
  panes. A read-only native zsh history view supplies the same local file to fzf
  without importing other panes' commands into arrow navigation. Nothing syncs
  remotely.
- **Ctrl-T** inserts selected file paths with quoting; **Alt-C** picks a directory
  while retaining a pending command. Esc cancels a picker.

Completion initialization validates its native cache when each shell starts,
so newly installed completion files appear without manual intervention.
`comp-rebuild` remains a recovery command after changing completion definitions.
npm script candidates come from `npm completion` through a native zsh adapter.
This avoids npm choosing its Bash integration after another completer loads
Bash compatibility functions; no project script parser is maintained here.

fnm remains the Node version authority, including recursive `.node-version`,
`.nvmrc`, and supported `package.json` engines. Installed requirements activate
on entry and before the prompt. Navigation never downloads a runtime or asks an
installation question. If activation fails, the shell reports the error and the
prompt retains **Node requirement unmet (active …)**. The previous runtime can
still run; it does not satisfy the project requirement. Set up the project
explicitly with `fnm install && fnm use`; the warning clears when activation
succeeds. direnv continues to own trusted project environment variables.

Run `python3 tests/shell_completion.py` and `python3 tests/shell_workflow.py`
for real-key acceptance with installed plugins and disposable state. The repository
checks also cover completion-cache freshness and offline fnm activation.
After updating, run `source ~/.zshrc` in existing shells or open a new tmux window.
Reload restores native `cd`, resets Tab/Ctrl-F, and replaces the old interactive
Node hook. No installed package needs to be removed.

## Java policy

One resolver (`nvim/lua/config/java.lua`) serves Neovim and bootstrap. It reads executable JDK homes and their `release` metadata, preserves custom/unversioned paths, and rejects missing explicit choices.

Copy `zsh/machine.example.zsh` to `${XDG_CONFIG_HOME:-~/.config}/dotdotdot/machine.zsh` to customize:

- `DOTDOTDOT_JAVA_VERSION`: optional Neovim project/standalone default. Otherwise use `JAVA_HOME`, then the newest installed JDK. Project Maven/Gradle toolchains remain authoritative.
- `JAVA_HOME`: optional shell-wide runtime, including custom paths. The shared shell configuration does not invent this setting.
- `DOTDOTDOT_JDTLS_JAVA_VERSION`: optional independent language-server runtime. Otherwise use the newest installed JDK; Java 21+ is required by the installed jdtls launcher.

For a Java 17 project with jdtls on Java 25, install both JDKs and export the two version preferences as 17 and 25 respectively. A nonexistent requested JDK is an error, never a silent fallback. Machine-only JDK packages can live in `Brewfile.local` alongside the machine profile.

## Theme state

Automatic mode follows macOS appearance: Rosé Pine Dawn in light mode and
Rosé Pine main in dark mode across WezTerm, tmux, Powerlevel10k, shell
highlighting/suggestions, fzf, and Neovim (including its buffer tabs).
The official [Rosé Pine roles](https://rosepinetheme.com/palette/) are stored in
`theme/palette.tsv`: main is the dark column, Dawn is the light column.
WezTerm, tmux, zsh/Powerlevel10k, and Neovim read these roles directly.
The packaged OMP Dawn JSON is checked against them by `tests/test_palette.py`.
WezTerm explicitly overrides its bundled schemes: their Dawn text and invisible
selection background differ from this shared palette. It also colors host tabs,
selection/search/copy highlights, command/character pickers, and window-frame
fields. macOS still owns the native titlebar material and window buttons.

ANSI indexes 0–7 map to overlay, love, foam, gold, pine, iris, rose, and text;
8–15 repeat those roles with subtle for bright black. Bold does not change a
WezTerm color to another ANSI slot. Neovim uses the same mapping for new terminal
buffers. Its native terminal API snapshots ANSI colors at `TermOpen`, so existing
terminal jobs retain their opening ANSI palette; reopen their terminal after a
mode change if needed. Existing task processes are preserved.

Tab completion inherits the same fzf palette. Tmux retains filled number/name
blocks for each window, with a stronger accent for the active window. Neovim's
Mason headers, database connection indicators, debugger highlights, file-tree
backgrounds, floating panels, and buffer tabs also follow the selected palette.
File-type icons retain the installed devicons light/dark brand colors; their
colors are intentionally separate from syntax and UI roles.
`theme auto` enables system following; `theme light` and `theme dark` select a
fixed palette until auto is enabled again. `theme` shows the current selection
and, in auto mode, the resolved appearance. The shell prompt remains Powerlevel10k;
`omp` refers to the optional Oh My Pi coding harness.

The machine-local `dotfiles-theme` file is the selection authority (`auto`,
`light`, or `dark`). WezTerm watches it and uses its native appearance-change
event to publish macOS changes to `dotfiles-theme-system`, a derived cache
shared with the other components. That cache has no effect on manual selections.
WezTerm refreshes existing tmux sessions and their environments on each auto
transition. Tmux resolves its startup environment from shared state and excludes
theme variables from client environment imports, so an older shell cannot
replace the selected mode when creating or attaching a session.
Neovim checks the shared mode once a second and on focus; shell
colors and the prompt refresh at the next prompt or editing redraw. Ordinary
arguments and paths inherit the terminal foreground, so they remain readable
even if appearance changes while the shell is idle with a pending command.
Keep WezTerm running for live
system following. The commands replace state files atomically and never modify
the checkout. A valid selection overrides inherited `DOTFILES_THEME`; the
environment remains a fallback when the selection file is missing or invalid.

`theme.conf` is the tracked first-install default (`auto`), not mutable session
state. Existing valid machine-local selections are preserved by bootstrap;
run `theme auto` to opt an existing installation into system following. The
old theme symlink is retained in `~/.dotfiles-backups/<timestamp>/` during migration.

### Oh My Pi

Oh My Pi manages its own config/auth/sessions. Its native appearance detector
follows the terminal background; `COLORFGBG` provides the matching startup
fallback in WezTerm, tmux, and new shell processes. Bootstrap links only the
custom theme when `omp` is installed. To select both slots once:

```sh
omp config set theme.light dotdotdot-rose-pine-dawn
omp config set theme.dark dark-rose-pine
```

The tracked Dawn theme lives in `omp/themes/` and covers the OMP 18.4.1 theme
schema, including tool panels, Markdown/code, and the status line. See
[omp/README.md](omp/README.md) for provenance and profile details. A running
harness can adopt the slots through `/settings`; new launches read them from
config. New shells/editors load the updated configuration; existing shells
need `source ~/.zshrc`, and existing editors need to reload the theme plugin or
restart after saving their buffers.

The tmux theme is loaded explicitly from the pinned Rosé Pine submodule before
TPM loads session plugins. The legacy Catppuccin submodule is retained unused;
TPM's repository-name mapping would otherwise confuse these two `tmux` repos.

## Verify changes and updates

1. Run `./scripts/check`, then `./bootstrap.sh --check`.
2. Check `wezterm --version` and `wezterm show-keys --lua` after a terminal update.
3. Run `python3 tests/navigation.py`. In WezTerm verify `Cmd-T/W` do nothing, `Cmd-Shift-P` opens the palette, and `Ctrl-T` still opens shell fzf. Test `Alt-r` resize mode and Escape on the desktop.
4. Run `python3 tests/theme_palette.py` for real installed WezTerm config parsing and Neovim plugin palette checks (including focused auto transitions and manual overrides). Run `python3 tests/shell_completion.py` for real-key completion and pending-command theme checks, and `python3 tests/tmux_theme.py` for private-server palette and stale-client environment checks. In `theme auto`, change macOS appearance and check WezTerm, tmux, Neovim, and OMP; shell colors refresh at the next prompt or keystroke. Check that `theme light` / `theme dark` stay fixed through system changes, then return to `theme auto`. Switching must leave `git diff -- theme.conf wezterm/wezterm.lua` unchanged.
5. Run `python3 tests/neovim_workflow.py` after editor workflow changes. It uses a private PTY and real installed plugins/LSPs with temporary fixtures/state. Automatic completion suggests open project names; `Ctrl-Space` requests broader LSP results and `Ctrl-x Ctrl-s` requests snippets. `Space r r` saves pending files in the current project before running. See [keybindings](KEYBINDINGS.md#neovim-completion-and-running).
6. Open a Java project and check the attached jdtls client's `cmd_env.JAVA_HOME`, project runtime, completion, and a main-class debugger session. Repeat language acceptance only for tooling changed by an update.

Use `./scripts/benchmark-startup` for repeated shell/editor startup measurements. It redirects transient state to a temporary directory, skips tmux auto-start, and preserves installed plugin data. Caches are warmed in the temporary directory. The shell measurement excludes machine-local interactive overrides; the report names that boundary. Compare medians on the same machine before considering performance changes.

Plugin commits are recorded in `nvim/lazy-lock.json` and tmux submodules. Homebrew and Mason tool versions are not fully locked; installation consistency is not a promise of byte-for-byte reproducibility. Review upgrades intentionally and record the actual build plus acceptance results. Dated results in the design document describe earlier versions.

## Palette consistency repair — 2026-10-08

- Powerlevel10k's wizard had replaced role colors with fixed indexes. Restored
  semantic prompt colors while keeping the selected prompt layout, and removed
  the extra wizard-added prompt load. Completion labels and shell syntax accents
  now use explicit role colors.
- Added one shared palette, explicit WezTerm text/selection/UI colors, tmux
  menu/popup/copy/prompt styles, and Neovim panel/bufferline/ANSI mappings.
- A real Neovim focus-triggered transition exposed suppressed nested ColorScheme
  hooks. The focus handler now permits those hooks, so plugin and terminal-default
  colors repaint together. Existing terminal jobs keep their native color snapshot.
- See the commands above for repeatable checks. CLI/config, private tmux, shell
  PTY, and installed Neovim checks do not establish screenshot or OS-toggle
  acceptance for an already-running OMP harness.

## Automatic appearance verification — 2026-10-03

- The plain-WezTerm argument regression was stale Dawn foregrounds on main's
  dark background: `tmux a -t learn` rendered `a` and `learn` with only 1.86:1
  contrast. Arguments now inherit the terminal foreground, and a ZLE redraw
  refreshes the prompt, syntax highlighting, suggestions, and fzf palette.
  Real-key tests passed both pending-command transitions after a configuration
  reload with the actual Powerlevel10k config, preserving input and cursor.
  Both transitions also preserve and repaint the visible autosuggestion.
  A disposable native WezTerm tab rendered those arguments at 13.39:1 contrast.
  Existing shells must run `source ~/.zshrc` once to install the new hook.
- A live tmux session still carried light variables while its status used main.
  A private-server regression reproduced stale shell variables overriding the
  session on creation. Tmux now resolves its global environment with the palette
  and removes legacy theme imports from `update-environment`, preserving other
  entries. Seven acceptance checks cover manual/automatic palettes and creating
  or attaching from a stale client. The test isolates Continuum's process-list
  probe so other running servers do not intentionally suppress its save hook.
  The live sessions were synchronized and
  read back with matching dark variables; the running editor also matched main.
- Follow-up checks passed both real OMP palettes, private tmux light → dark →
  light with filled window blocks, and installed Neovim plugin highlights plus
  automatic dark → light → dark changes without focus events. This checks OMP's
  actual startup rendering; an OS-triggered transition in an already-running
  harness was not exercised in this follow-up.
- Repository checks passed: 13 disposable-home integration tests, 13 Lua
  configuration checks, and five tooling checks. Automatic transitions cover
  light/dark and high-contrast appearance values, manual overrides, and a GUI
  helper with Homebrew absent from PATH. All 10 shell completion checks and four
  pending-command/suggestion theme transition checks passed.
- A real WezTerm config event published the current macOS dark appearance and
  refreshed tmux from Dawn to main. WezTerm reported main's `#191724` background;
  a new shell exported matching `DOTFILES_THEME=dark` and `COLORFGBG=15;0`.
  The macOS appearance setting itself was unchanged during these checks.
- The installed Neovim theme passed automatic dark → light → dark repaints
  without focus events. The running editor was refreshed with buffers and its
  cursor preserved. The machine doctor passed with the existing dirty tmux
  submodule warning. This machine is now set to `theme auto`.

## Rosé Pine verification — 2026-09-30

- Repository checks passed: 12 disposable-home integration tests, 11 Lua
  configuration checks, and five tooling checks. All 10 real-key shell
  completion checks passed. The machine doctor passed with only the existing
  modified-submodule warning.
- Actual WezTerm and tmux OSC 11 replies both reported Dawn's `#faf4ed` base.
  The live tmux status uses Dawn and retains its Continuum save hook. Existing
  session environments now agree with the shared light mode.
- A private tmux server and the real Neovim theme plugin passed light → dark →
  light checks. Full Neovim startup loaded Rose Pine and its buffer tabs. The
  running editor was refreshed in place; buffer modification state and cursor
  position were preserved.
- The follow-up audit restored filled tmux window blocks and verified them in
  both modes. A disposable shell PTY confirmed that Tab completion renders
  Dawn's actual background/text RGB values while its selection behavior still
  passes all 10 completion checks. Neovim's Mason, Dadbod syntax, debugger,
  Overseer, completion, and buffer-tab highlights passed light → dark → light
  checks using the installed plugins. Both running editors use light Rosé Pine.
- OMP 18.4.1 parsed and rendered both theme slots in disposable PTY sessions;
  no model prompts were sent. Native CLI readback confirmed both persisted
  slots. The prior OMP config is backed up under
  `~/.dotfiles-backups/20260930-rose-pine/omp-config.yml` on this machine.
  The doctor now checks the custom theme link whenever OMP is installed.
- Existing shells still need `source ~/.zshrc`; new shells pick up prompt,
  suggestions, syntax highlighting, and fzf automatically. Existing OMP
  sessions may need `/settings` or a fresh launch to adopt the new slot names.

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
