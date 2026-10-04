# Oh My Pi theme

`dotdotdot-rose-pine-dawn.json` adapts Oh My Pi 18.4.1's bundled
[dark-rose-pine theme](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/theme/defaults/dark-rose-pine.json)
to the official [Rosé Pine Dawn palette](https://rosepinetheme.com/palette/).
It defines every required token in that version's
[theme schema](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/theme/theme-schema.json).
Text and tool output use Dawn's text color; secondary text uses subtle for
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
