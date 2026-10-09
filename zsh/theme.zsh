# Machine-local state shared by WezTerm, tmux, the shell, and Neovim.
# Replace old symlinks atomically; never write theme state into the checkout.
typeset -g _DOTDOTDOT_PALETTE_FILE="${${(%):-%x}:A:h}/../theme/palette.tsv"

_dotdotdot_theme_selection() {
  local file="${XDG_CONFIG_HOME:-$HOME/.config}/dotfiles-theme" mode
  [[ -r "$file" ]] && read -r mode < "$file"
  case "$mode" in
    auto|dark|light) print -r -- "$mode" ;;
    *) [[ "${DOTFILES_THEME:-}" == dark ]] && print dark || print light ;;
  esac
}

_dotdotdot_system_theme() {
  local appearance
  appearance=$(/usr/bin/defaults read -g AppleInterfaceStyle 2>/dev/null)
  [[ "$appearance" == Dark ]] && print dark || print light
}

_dotdotdot_theme_mode() {
  local selection="$(_dotdotdot_theme_selection)" mode
  if [[ "$selection" == auto ]]; then
    # WezTerm publishes appearance changes here; this is a cache, not a setting.
    local cache="${XDG_CONFIG_HOME:-$HOME/.config}/dotfiles-theme-system"
    [[ -r "$cache" ]] && read -r mode < "$cache"
    case "$mode" in
      dark|light) print -r -- "$mode" ;;
      *) _dotdotdot_system_theme ;;
    esac
  else
    print -r -- "$selection"
  fi
}

_dotdotdot_write_theme_state() {
  local file="$1" value="$2" temporary
  mkdir -p "${file:h}" || return 1
  temporary="$(mktemp "${file}.XXXXXX")" || return 1
  if ! print -r -- "$value" > "$temporary" || ! mv -f -- "$temporary" "$file"; then
    rm -f -- "$temporary"
    return 1
  fi
}

_dotdotdot_load_theme_palette() {
  typeset -g DOTFILES_THEME="$(_dotdotdot_theme_mode)"
  export DOTFILES_THEME
  export COLORFGBG="$([[ "$DOTFILES_THEME" == dark ]] && print '15;0' || print '0;15')"
  typeset -gA DOTDOTDOT_COLORS
  local role main dawn
  DOTDOTDOT_COLORS=()
  while read -r role main dawn; do
    [[ "$role" != \#* && -n "$role" ]] || continue
    if [[ "$DOTFILES_THEME" == dark ]]; then
      DOTDOTDOT_COLORS[$role]="$main"
    else
      DOTDOTDOT_COLORS[$role]="$dawn"
    fi
  done < "$_DOTDOTDOT_PALETTE_FILE"
}

_dotdotdot_apply_shell_theme() {
  typeset -g ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=$DOTDOTDOT_COLORS[subtle]"
  # Remember existing fzf flags once; never accumulate color arguments on reload.
  if (( ! ${+_DOTDOTDOT_FZF_BASE_OPTS} )); then
    typeset -gx _DOTDOTDOT_FZF_BASE_OPTS="${FZF_DEFAULT_OPTS:-}"
  fi
  export FZF_DEFAULT_OPTS="$_DOTDOTDOT_FZF_BASE_OPTS --color=bg:$DOTDOTDOT_COLORS[base],bg+:$DOTDOTDOT_COLORS[overlay],fg:$DOTDOTDOT_COLORS[text],fg+:$DOTDOTDOT_COLORS[text],hl:$DOTDOTDOT_COLORS[pine],hl+:$DOTDOTDOT_COLORS[pine],info:$DOTDOTDOT_COLORS[subtle],prompt:$DOTDOTDOT_COLORS[iris],pointer:$DOTDOTDOT_COLORS[rose],marker:$DOTDOTDOT_COLORS[love],spinner:$DOTDOTDOT_COLORS[iris],header:$DOTDOTDOT_COLORS[subtle],border:$DOTDOTDOT_COLORS[muted]"
  zstyle ':completion:*:descriptions' format "%F{$DOTDOTDOT_COLORS[subtle]}-- %d --%f"
  zstyle ':completion:*:messages' format "%F{$DOTDOTDOT_COLORS[iris]}-- %d --%f"
  zstyle ':completion:*:warnings' format "%F{$DOTDOTDOT_COLORS[love]}-- no matches found --%f"
  if (( ${+ZSH_HIGHLIGHT_STYLES} )); then
    # Ordinary arguments follow the terminal foreground even while ZLE is idle
    # and WezTerm changes appearance underneath the pending command.
    ZSH_HIGHLIGHT_STYLES[default]='none'
    ZSH_HIGHLIGHT_STYLES[unknown-token]="fg=$DOTDOTDOT_COLORS[love]"
    ZSH_HIGHLIGHT_STYLES[reserved-word]="fg=$DOTDOTDOT_COLORS[pine]"
    ZSH_HIGHLIGHT_STYLES[command]="fg=$DOTDOTDOT_COLORS[pine]"
    ZSH_HIGHLIGHT_STYLES[builtin]="fg=$DOTDOTDOT_COLORS[pine]"
    ZSH_HIGHLIGHT_STYLES[alias]="fg=$DOTDOTDOT_COLORS[pine]"
    ZSH_HIGHLIGHT_STYLES[function]="fg=$DOTDOTDOT_COLORS[pine]"
    local kind
    for kind in suffix-alias precommand autodirectory; do
      ZSH_HIGHLIGHT_STYLES[$kind]="fg=$DOTDOTDOT_COLORS[pine],underline"
    done
    for kind in global-alias arg0; do
      ZSH_HIGHLIGHT_STYLES[$kind]="fg=$DOTDOTDOT_COLORS[pine]"
    done
    for kind in globbing history-expansion; do
      ZSH_HIGHLIGHT_STYLES[$kind]="fg=$DOTDOTDOT_COLORS[iris]"
    done
    for kind in command-substitution-delimiter process-substitution-delimiter back-quoted-argument-delimiter; do
      ZSH_HIGHLIGHT_STYLES[$kind]="fg=$DOTDOTDOT_COLORS[iris]"
    done
    for kind in dollar-quoted-argument redirection; do
      ZSH_HIGHLIGHT_STYLES[$kind]="fg=$DOTDOTDOT_COLORS[gold]"
    done
    for kind in rc-quote dollar-double-quoted-argument back-double-quoted-argument back-dollar-quoted-argument; do
      ZSH_HIGHLIGHT_STYLES[$kind]="fg=$DOTDOTDOT_COLORS[foam]"
    done
    ZSH_HIGHLIGHT_STYLES[path]='underline'
    ZSH_HIGHLIGHT_STYLES[single-quoted-argument]="fg=$DOTDOTDOT_COLORS[gold]"
    ZSH_HIGHLIGHT_STYLES[double-quoted-argument]="fg=$DOTDOTDOT_COLORS[gold]"
    ZSH_HIGHLIGHT_STYLES[comment]="fg=$DOTDOTDOT_COLORS[subtle]"
  fi
}

_dotdotdot_refresh_theme() {
  local mode="$(_dotdotdot_theme_mode)"
  [[ "$mode" != "${_DOTDOTDOT_APPLIED_THEME:-}" ]] || return 0
  _dotdotdot_load_theme_palette
  _dotdotdot_apply_shell_theme
  typeset -g _DOTDOTDOT_APPLIED_THEME="$mode"
  # The prompt reads this palette on each configuration reload.
  if (( $+functions[p10k] )) && [[ -r "$HOME/.p10k.zsh" ]]; then
    source "$HOME/.p10k.zsh"
  fi
}

_dotdotdot_refresh_shell_line() {
  local previous="${_DOTDOTDOT_APPLIED_THEME:-}"
  _dotdotdot_refresh_theme
  if [[ "$previous" != "${_DOTDOTDOT_APPLIED_THEME:-}" ]]; then
    # Plugin hooks may have painted before ours, especially after a config
    # reload. Invalidate cached styles and repaint without changing the input.
    if (( $+functions[_zsh_highlight] )); then
      unset _ZSH_HIGHLIGHT_PRIOR_BUFFER
      _zsh_highlight
    fi
    if (( $+functions[_zsh_autosuggest_highlight_reset] && $+functions[_zsh_autosuggest_highlight_apply] )); then
      _zsh_autosuggest_highlight_reset
      _zsh_autosuggest_highlight_apply
    fi
  fi
  # Subsequent redraw hooks must still run when no palette change was needed.
  return 0
}

_dotdotdot_sync_tmux_theme() {
  local mode="$1" session_id
  local colorfgbg="$([[ "$mode" == dark ]] && print '15;0' || print '0;15')"
  # A GUI-launched helper does not inherit the interactive shell's brew PATH.
  local tmux_binary="${commands[tmux]:-${HOMEBREW_PREFIX:-/opt/homebrew}/bin/tmux}"
  if [[ -x "$tmux_binary" ]] && "$tmux_binary" has-session 2>/dev/null; then
    "$tmux_binary" set-environment -g DOTFILES_THEME "$mode"
    "$tmux_binary" set-environment -g COLORFGBG "$colorfgbg"
    # Existing sessions can mask the global environment with their old mode.
    for session_id in ${(f)"$("$tmux_binary" list-sessions -F '#{session_id}')"}; do
      "$tmux_binary" set-environment -t "$session_id" DOTFILES_THEME "$mode"
      "$tmux_binary" set-environment -t "$session_id" COLORFGBG "$colorfgbg"
    done
    "$tmux_binary" source-file "$HOME/.tmux.conf" || return 1
    "$tmux_binary" refresh-client -S 2>/dev/null || true
  fi
}

_dotdotdot_sync_system_theme() {
  [[ "$1" == dark || "$1" == light ]] || return 1
  [[ "$(_dotdotdot_theme_selection)" == auto ]] || return 0
  local cache="${XDG_CONFIG_HOME:-$HOME/.config}/dotfiles-theme-system" previous
  [[ -r "$cache" ]] && read -r previous < "$cache"
  [[ "$previous" != "$1" || "${2:-}" == force ]] || return 0
  _dotdotdot_write_theme_state "$cache" "$1" || return 1
  _dotdotdot_refresh_theme
  _dotdotdot_sync_tmux_theme "$1"
}

theme() {
  local file="${XDG_CONFIG_HOME:-$HOME/.config}/dotfiles-theme" mode
  if (( $# == 0 )); then
    local selection="$(_dotdotdot_theme_selection)"
    if [[ "$selection" == auto ]]; then
      print "auto ($(_dotdotdot_theme_mode))"
    else
      print -r -- "$selection"
    fi
    return 0
  fi
  if (( $# != 1 )) || [[ "$1" != auto && "$1" != dark && "$1" != light ]]; then
    print -u2 'usage: theme [auto|dark|light]'
    return 1
  fi
  # Seed the cache before enabling auto, so readers never see a stale mode.
  if [[ "$1" == auto ]]; then
    mode="$(_dotdotdot_system_theme)"
    _dotdotdot_write_theme_state "${file}-system" "$mode" || return 1
  fi
  _dotdotdot_write_theme_state "$file" "$1" || return 1
  _dotdotdot_refresh_theme
  _dotdotdot_sync_tmux_theme "$(_dotdotdot_theme_mode)" || return 1
  print "theme set to $1"
}

_dotdotdot_load_theme_palette
# The tmux config can also execute this file as a lightweight mode resolver.
[[ "$ZSH_EVAL_CONTEXT" != toplevel ]] || print -r -- "$DOTFILES_THEME"
