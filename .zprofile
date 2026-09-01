# Login-shell environment. Interactive behavior belongs in .zshrc.

typeset -g _DOTDOTDOT_REPO_ROOT="${${(%):-%x}:A:h}"
source "$_DOTDOTDOT_REPO_ROOT/zsh/env.zsh"
unset _DOTDOTDOT_REPO_ROOT
