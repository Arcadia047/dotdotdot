# Powerlevel10k instant prompt must stay near the top of this file.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

typeset -g _DOTDOTDOT_REPO_ROOT="${${(%):-%x}:A:h}"
source "$_DOTDOTDOT_REPO_ROOT/zsh/env.zsh"
source "$_DOTDOTDOT_REPO_ROOT/zsh/theme.zsh"
unset _DOTDOTDOT_REPO_ROOT

typeset -U path PATH fpath FPATH

export EDITOR=nvim
export VISUAL=nvim
export PAGER='less -FRX'
export MANPAGER='less -R'
export LESSHISTFILE=-
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'

# One on-disk history, with immediate writes and local arrow-key navigation.
typeset -g ZSH_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}/zsh"
mkdir -p "$ZSH_STATE_HOME"
chmod 700 "$ZSH_STATE_HOME"
export HISTFILE="$ZSH_STATE_HOME/history"
touch "$HISTFILE"
chmod 600 "$HISTFILE"
HISTSIZE=100000
SAVEHIST=100000

setopt APPEND_HISTORY
setopt EXTENDED_HISTORY
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_REDUCE_BLANKS
setopt HIST_SAVE_NO_DUPS
setopt HIST_VERIFY
unsetopt SHARE_HISTORY INC_APPEND_HISTORY_TIME
setopt INC_APPEND_HISTORY

setopt ALWAYS_TO_END
setopt AUTO_CD
setopt AUTO_MENU
setopt AUTO_PUSHD
setopt COMPLETE_IN_WORD
setopt INTERACTIVE_COMMENTS
setopt NO_BEEP
setopt PUSHD_IGNORE_DUPS
setopt PUSHD_SILENT
unsetopt FLOW_CONTROL

# Make word deletion stop at path separators, which is friendlier for editing commands.
WORDCHARS='*?_-.[]~=&;!#$%^(){}<>'
bindkey -e
# Reset plugin bindings before loading them, including on configuration reload.
(( $+functions[disable-fzf-tab] )) && disable-fzf-tab
bindkey '^I' expand-or-complete
bindkey '^F' forward-char

# Register completions before compinit. Homebrew and Docker own these files.
fpath=(
  "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh/site-functions"
  "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-completions"
  "$HOME/.docker/completions"
  $fpath
)

zstyle ':completion:*' menu select
zstyle ':completion:*' group-name ''
zstyle ':completion:*' squeeze-slashes true
zstyle ':completion:*' use-cache true
zstyle ':completion:*' cache-path "${XDG_CACHE_HOME:-$HOME/.cache}/zsh/completion"
# Keep the completer chain quiet: _complete for exact matches and _approximate
# as a bounded fallback. _match and the separator-matching patterns flooded
# Tab menus with irrelevant fuzzy candidates.
zstyle ':completion:*' completer _complete _approximate
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*:approximate:*' max-errors 1 numeric
zstyle ':completion:*:descriptions' format '%F{yellow}-- %d --%f'
zstyle ':completion:*:messages' format '%F{purple}-- %d --%f'
zstyle ':completion:*:warnings' format '%F{red}-- no matches found --%f'
zstyle ':completion:*:*:*:*:processes' command 'ps -u $USER -o pid,user,command -w'
zstyle ':completion:*:cd:*' tag-order local-directories directory-stack path-directories

typeset -g ZSH_COMPDUMP="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/zcompdump-${ZSH_VERSION}"
mkdir -p "${ZSH_COMPDUMP:h}" "${XDG_CACHE_HOME:-$HOME/.cache}/zsh/completion"
autoload -Uz compinit
# Native validation notices newly installed completion files.
compinit -d "$ZSH_COMPDUMP"

# npm's generated script detects Bash first, even when another zsh completer
# has loaded bashcompinit. Use its supported candidate API directly in zsh.
_dotdotdot_npm_completion() {
  local -x NPM_CONFIG_UPDATE_NOTIFIER=false
  local -a candidates
  candidates=("${(@f)$(COMP_CWORD=$((CURRENT - 1)) COMP_LINE="$BUFFER" COMP_POINT=0 \
    npm completion -- "${words[@]}" </dev/null 2>/dev/null)}")
  [[ -n "${candidates[1]:-}" ]] || return 1
  compadd -- "${candidates[@]}"
}
compdef _dotdotdot_npm_completion npm

# Refresh the completion cache after installing or removing command-line tools.
comp-rebuild() {
  rm -f -- "$ZSH_COMPDUMP" "$ZSH_COMPDUMP.zwc"
  compinit -d "$ZSH_COMPDUMP"
  compdef _dotdotdot_npm_completion npm
}

# fzf provides Ctrl-R history search, Ctrl-T file insertion, and Alt-C directory search.
[[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/completion.zsh" ]] \
  && source "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/completion.zsh"
[[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/key-bindings.zsh" ]] \
  && source "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/key-bindings.zsh"

# Turn normal completion into a fuzzy, explicitly-selected Tab menu.
if [[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf-tab/share/fzf-tab/fzf-tab.zsh" ]]; then
  source "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf-tab/share/fzf-tab/fzf-tab.zsh"
  # Open the picker immediately, even when candidates share a longer prefix.
  zstyle ':completion:*' menu yes
  # fzf-tab otherwise discards the shared palette in FZF_DEFAULT_OPTS.
  zstyle ':fzf-tab:*' use-fzf-default-opts yes
  zstyle ':fzf-tab:*' fzf-flags --height=55% --layout=reverse --border
  zstyle ':fzf-tab:*' switch-group '<' '>'
  zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls -la --color=always $realpath 2>/dev/null || ls -la $realpath'
fi

# Hints recall history only; Tab always belongs to semantic completion.
# Remove the retired custom widgets/strategy when reloading an existing shell.
unfunction _zsh_autosuggest_strategy_directory_prefix accept-suggestion-or-complete 2>/dev/null
zle -D accept-suggestion-or-complete 2>/dev/null
unset ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE
if [[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-autosuggestions/zsh-autosuggestions.zsh" ]]; then
  ZSH_AUTOSUGGEST_STRATEGY=(history)
  source "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
fi

# Native prefix search; fzf owns only the global history-search UI.
autoload -Uz up-line-or-beginning-search down-line-or-beginning-search
zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search
bindkey '^[[A' up-line-or-beginning-search
bindkey '^[[B' down-line-or-beginning-search
bindkey '^[OA' up-line-or-beginning-search
bindkey '^[OB' down-line-or-beginning-search
shared-history-search() {
  # Native zsh parses a read-only snapshot in a subshell. Give fzf's existing
  # widget that history view without changing this editor's history context.
  local -a entries
  entries=("${(@0)$(
    fc -p -a "$HISTFILE" "$HISTSIZE" 0 || return
    zmodload zsh/parameter
    printf '%s\0' "${(@kv)history}"
  )}")
  entries[-1]=() # printf's final NUL separates, rather than creates, an entry.
  local -h -A history
  history=("${entries[@]}")
  zle fzf-history-widget
}
if (( $+widgets[fzf-history-widget] )); then
  zle -N shared-history-search
  bindkey '^R' shared-history-search
fi

# Start the tmux server on first interactive use so `tmux ls` works in a
# fresh terminal instead of reporting "no server running". A throwaway
# _boot session keeps the server alive while tmux-continuum's auto-restore
# (fires ~1s after server start) recreates the saved sessions; the boot
# session is removed afterwards so resurrect never persists it.
ensure_tmux_server() {
  (( $+commands[tmux] )) || return 0
  [[ -o interactive && -z "$TMUX" && -z "$TMUX_BOOTSTRAPPED" ]] || return 0
  typeset -g TMUX_BOOTSTRAPPED=1
  tmux has-session 2>/dev/null && return 0
  tmux new-session -d -s _boot 2>/dev/null || return 0
  (
    integer i
    for (( i = 0; i < 10; i++ )); do
      sleep 1
      (( $(tmux list-sessions 2>/dev/null | wc -l) > 1 )) && break
    done
    tmux has-session -t _boot 2>/dev/null && tmux kill-session -t _boot
  ) &!
}
ensure_tmux_server

# fnm owns version discovery; the adapter keeps navigation non-interactive.
source "${${(%):-%x}:A:h}/zsh/node.zsh"

# Native cd handles paths; z/zi explicitly request learned directory jumping.
unfunction cd cdi 2>/dev/null
compdef _cd cd
(( $+commands[direnv] )) && eval "$(direnv hook zsh)"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"

# Keep machine-specific environment variables and secrets outside this repo.
typeset -g ZSH_LOCAL_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/zsh/local.zsh"
[[ -r "$ZSH_LOCAL_CONFIG" ]] && source "$ZSH_LOCAL_CONFIG"
unset ZSH_LOCAL_CONFIG

alias v='nvim'
alias lg='lazygit'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

[[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/share/powerlevel10k/powerlevel10k.zsh-theme" ]] \
  && source "${HOMEBREW_PREFIX:-/opt/homebrew}/share/powerlevel10k/powerlevel10k.zsh-theme"
[[ -r "$HOME/.p10k.zsh" ]] && source "$HOME/.p10k.zsh"

# Syntax highlighting must be sourced after every other ZLE plugin.
[[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]] \
  && source "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

# Resolve the current palette for shell colors, and follow external theme changes.
_dotdotdot_apply_shell_theme
typeset -g _DOTDOTDOT_APPLIED_THEME="$DOTFILES_THEME"
autoload -Uz add-zsh-hook
add-zsh-hook precmd _dotdotdot_refresh_theme
autoload -Uz add-zle-hook-widget
add-zle-hook-widget zle-line-pre-redraw _dotdotdot_refresh_shell_line
