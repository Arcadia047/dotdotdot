# Powerlevel10k instant prompt must stay near the top of this file.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

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
setopt SHARE_HISTORY

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
  /opt/homebrew/share/zsh/site-functions
  /opt/homebrew/share/zsh-completions
  "$HOME/.docker/completions"
  $fpath
)

zstyle ':completion:*' menu select
zstyle ':completion:*' group-name ''
zstyle ':completion:*' squeeze-slashes true
zstyle ':completion:*' use-cache true
zstyle ':completion:*' cache-path "${XDG_CACHE_HOME:-$HOME/.cache}/zsh/completion"
zstyle ':completion:*' completer _complete _match _approximate
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}' 'r:|[._-]=** r:|=**'
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
[[ -r /opt/homebrew/opt/fzf/shell/completion.zsh ]] && source /opt/homebrew/opt/fzf/shell/completion.zsh
[[ -r /opt/homebrew/opt/fzf/shell/key-bindings.zsh ]] && source /opt/homebrew/opt/fzf/shell/key-bindings.zsh

# Turn normal completion into a fuzzy, explicitly-selected Tab menu.
if [[ -r /opt/homebrew/opt/fzf-tab/share/fzf-tab/fzf-tab.zsh ]]; then
  source /opt/homebrew/opt/fzf-tab/share/fzf-tab/fzf-tab.zsh
  zstyle ':fzf-tab:*' fzf-flags --height=55% --layout=reverse --border
  zstyle ':fzf-tab:*' switch-group '<' '>'
  zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls -la --color=always $realpath 2>/dev/null || ls -la $realpath'
fi

# Lightweight, non-AI suggestions; Ctrl-F accepts the visible suggestion.
if [[ -r /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  ZSH_AUTOSUGGEST_STRATEGY=(history completion)
  ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=40
  source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
  bindkey '^F' autosuggest-accept
fi

if [[ -r /opt/homebrew/share/zsh-history-substring-search/zsh-history-substring-search.zsh ]]; then
  source /opt/homebrew/share/zsh-history-substring-search/zsh-history-substring-search.zsh
  bindkey '^[[A' history-substring-search-up
  bindkey '^[[B' history-substring-search-down
  bindkey '^[OA' history-substring-search-up
  bindkey '^[OB' history-substring-search-down
fi

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

[[ -r /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme ]] \
  && source /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme
[[ -r "$HOME/.p10k.zsh" ]] && source "$HOME/.p10k.zsh"

# Syntax highlighting must be sourced after every other ZLE plugin.
[[ -r /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] \
  && source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
