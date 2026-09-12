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

# Keep command history local, immediately shared across terminals, and useful.
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
# INC_APPEND_HISTORY writes each command to the shared history file
# immediately but, unlike SHARE_HISTORY, never imports other running shells'
# lines into this session — so arrow-up stays local to the current tmux
# session/pane while new shells still see the full shared history.
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
if [[ -s "$ZSH_COMPDUMP" ]]; then
  compinit -C -d "$ZSH_COMPDUMP"
else
  compinit -d "$ZSH_COMPDUMP"
fi

# Refresh the completion cache after installing or removing command-line tools.
comp-rebuild() {
  rm -f -- "$ZSH_COMPDUMP" "$ZSH_COMPDUMP.zwc"
  compinit -d "$ZSH_COMPDUMP"
}

# fzf provides Ctrl-R history search, Ctrl-T file insertion, and Alt-C directory search.
[[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/completion.zsh" ]] \
  && source "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/completion.zsh"
[[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/key-bindings.zsh" ]] \
  && source "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf/shell/key-bindings.zsh"

# Turn normal completion into a fuzzy, explicitly-selected Tab menu.
if [[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf-tab/share/fzf-tab/fzf-tab.zsh" ]]; then
  source "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/fzf-tab/share/fzf-tab/fzf-tab.zsh"
  zstyle ':fzf-tab:*' fzf-flags --height=55% --layout=reverse --border
  zstyle ':fzf-tab:*' switch-group '<' '>'
  zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls -la --color=always $realpath 2>/dev/null || ls -la $realpath'
fi

# Lightweight, non-AI suggestions; Ctrl-F accepts the visible suggestion.
if [[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-autosuggestions/zsh-autosuggestions.zsh" ]]; then
  ZSH_AUTOSUGGEST_STRATEGY=(history completion)
  ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=40
  source "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
  bindkey '^F' autosuggest-accept

  # Tab accepts the grey suggestion when one is visible; otherwise it opens the
  # fzf fuzzy completion menu. Ctrl-F also accepts the visible suggestion.
  accept-suggestion-or-complete() {
    if [[ -n "${POSTDISPLAY:-}" ]]; then
      zle autosuggest-accept
    elif (( $+widgets[fzf-tab-complete] )); then
      zle fzf-tab-complete
    else
      zle expand-or-complete
    fi
  }
  # This widget reads POSTDISPLAY itself. Autosuggestions must not wrap it as
  # an editing widget, because that wrapper clears POSTDISPLAY before calling us.
  ZSH_AUTOSUGGEST_IGNORE_WIDGETS+=(accept-suggestion-or-complete)
  zle -N accept-suggestion-or-complete
  bindkey '^I' accept-suggestion-or-complete
fi

if [[ -r "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-history-substring-search/zsh-history-substring-search.zsh" ]]; then
  source "${HOMEBREW_PREFIX:-/opt/homebrew}/share/zsh-history-substring-search/zsh-history-substring-search.zsh"
  bindkey '^[[A' history-substring-search-up
  bindkey '^[[B' history-substring-search-down
  bindkey '^[OA' history-substring-search-up
  bindkey '^[OB' history-substring-search-down
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

# Per-project Node versions without the startup cost of NVM.
# Per-project Node versions without the startup cost of NVM.
if (( $+commands[fnm] )); then
  eval "$(fnm env --use-on-cd --version-file-strategy=recursive --corepack-enabled --shell zsh)"
fi

# Project-local environment variables and fast directory jumping.
(( $+commands[direnv] )) && eval "$(direnv hook zsh)"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh --cmd cd)"

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
