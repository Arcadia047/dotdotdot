# Login-shell environment. Interactive behavior belongs in .zshrc.

if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

typeset -U path PATH
# Do not inherit retired runtime managers from a long-lived terminal or tmux server.
typeset -a clean_path
for entry in $path; do
  case "$entry" in
    "$HOME"/.nvm/*|"$HOME"/.pyenv/*|"$HOME"/opt/anaconda3/*|/usr/local/opt/ruby/*|/usr/local/lib/ruby/*|/Library/Frameworks/Python.framework/Versions/3.9/*)
      ;;
    "$HOME/.cargo/bin")
      # Re-add Cargo after Homebrew so old cargo-installed fd/rg binaries do not win.
      ;;
    *)
      clean_path+=("$entry")
      ;;
  esac
done
path=($clean_path)
unset clean_path entry
unset NVM_DIR PYENV_ROOT PYENV_VERSION CONDA_EXE CONDA_PREFIX CONDA_DEFAULT_ENV CONDA_PYTHON_EXE CONDA_SHLVL _CE_CONDA _CE_M
path=(
  "$HOME/.local/bin"
  "$HOME/go/bin"
  "$HOME/Library/Application Support/Coursier/bin"
  "$HOME/.bun/bin"
  "$HOME/.local/share/nvim/mason/bin"
  /opt/homebrew/opt/libpq/bin
  $path
  "$HOME/.cargo/bin"
)

export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
path=("$JAVA_HOME/bin" $path)

export PKG_CONFIG_PATH="/opt/homebrew/opt/libpq/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
