# Shared machine environment for login and interactive zsh shells.
# The non-exported guard avoids doing the work twice in one login shell while
# still allowing every child shell (including new tmux panes) to resolve its
# own machine profile.
if (( ${+_DOTDOTDOT_ENV_LOADED} )); then
  return 0
fi
typeset -g _DOTDOTDOT_ENV_LOADED=1

typeset -U path PATH

typeset _dotdotdot_brew_bin=""
if (( $+commands[brew] )); then
  _dotdotdot_brew_bin="${commands[brew]}"
elif [[ -x /opt/homebrew/bin/brew ]]; then
  _dotdotdot_brew_bin=/opt/homebrew/bin/brew
elif [[ -x /usr/local/bin/brew ]]; then
  _dotdotdot_brew_bin=/usr/local/bin/brew
fi

if [[ -n "$_dotdotdot_brew_bin" ]]; then
  eval "$("$_dotdotdot_brew_bin" shellenv)"
fi

# Machine preferences (Java version, extra PATH) live in machine.zsh, never in
# this repo, so this repository never overrides a machine's own JVM choice.
typeset -ga DOTDOTDOT_PATH_PREPEND
typeset -ga DOTDOTDOT_PATH_APPEND
typeset -g DOTDOTDOT_MACHINE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/dotdotdot/machine.zsh"

if [[ -r "$DOTDOTDOT_MACHINE_CONFIG" ]]; then
  source "$DOTDOTDOT_MACHINE_CONFIG"
fi

# Remove retired runtime managers and paths that this module reconstructs.
# Machine-set JAVA_HOME is respected as-is; the repo never defaults it.
typeset -a _dotdotdot_clean_path
typeset -a _dotdotdot_clean_path
typeset _dotdotdot_entry
for _dotdotdot_entry in "${path[@]}"; do
  case "$_dotdotdot_entry" in
    "$HOME"/.nvm/* | "$HOME"/.pyenv/* | "$HOME"/opt/anaconda3/* | /usr/local/opt/ruby/* | /usr/local/lib/ruby/* | /Library/Frameworks/Python.framework/Versions/3.9/* | */opt/openjdk@*/libexec/openjdk.jdk/Contents/Home/bin | /opt/homebrew/opt/libpq/bin | /usr/local/opt/libpq/bin | "$HOME/.cargo/bin")
      ;;
    *) _dotdotdot_clean_path+=("$_dotdotdot_entry") ;;
  esac
done

unset NVM_DIR PYENV_ROOT PYENV_VERSION CONDA_EXE CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PYTHON_EXE CONDA_SHLVL _CE_CONDA _CE_M
# JAVA_HOME is intentionally not set here — a machine opts in via machine.zsh.

typeset -a _dotdotdot_prepend_candidates _dotdotdot_prepend _dotdotdot_append
_dotdotdot_prepend_candidates=("${DOTDOTDOT_PATH_PREPEND[@]}")
[[ -n "${JAVA_HOME:-}" ]] && _dotdotdot_prepend_candidates+=("$JAVA_HOME/bin")
_dotdotdot_prepend_candidates+=(
  "$HOME/.local/bin"
  "$HOME/go/bin"
  "$HOME/Library/Application Support/Coursier/bin"
  "$HOME/.bun/bin"
  "$HOME/.local/share/nvim/mason/bin"
)
[[ -n "${HOMEBREW_PREFIX:-}" ]] && _dotdotdot_prepend_candidates+=("$HOMEBREW_PREFIX/opt/libpq/bin")

for _dotdotdot_entry in "${_dotdotdot_prepend_candidates[@]}"; do
  [[ -d "$_dotdotdot_entry" ]] && _dotdotdot_prepend+=("$_dotdotdot_entry")
done
for _dotdotdot_entry in "${DOTDOTDOT_PATH_APPEND[@]}" "$HOME/.cargo/bin"; do
  [[ -d "$_dotdotdot_entry" ]] && _dotdotdot_append+=("$_dotdotdot_entry")
done

path=("${_dotdotdot_prepend[@]}" "${_dotdotdot_clean_path[@]}" "${_dotdotdot_append[@]}")
typeset -U path PATH

if [[ -n "${HOMEBREW_PREFIX:-}" && -d "$HOMEBREW_PREFIX/opt/libpq/lib/pkgconfig" ]]; then
  case ":${PKG_CONFIG_PATH:-}:" in
    *":$HOMEBREW_PREFIX/opt/libpq/lib/pkgconfig:"*) ;;
    *) export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/libpq/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}" ;;
  esac
fi

unset _dotdotdot_brew_bin
unset _dotdotdot_clean_path _dotdotdot_entry _dotdotdot_prepend_candidates _dotdotdot_prepend _dotdotdot_append
