# Copy this file to ~/.config/dotdotdot/machine.zsh and change only
# preferences that should differ on this Mac. Bootstrap never overwrites it.
# The repo's shared config intentionally sets no machine-preference env vars,
# so nothing here is forced on machines that don't create this file.

# Default JVM for this Mac's Neovim (jdtls). Any Homebrew openjdk@<major> works;
# Neovim defaults to the newest one installed when this is unset.
# typeset -g DOTDOTDOT_JAVA_VERSION=25

# Export JAVA_HOME only if this Mac should default to a specific JVM in every
# shell. The repo never defaults it. Example (Homebrew OpenJDK 21):
# export JAVA_HOME="${HOMEBREW_PREFIX:-/opt/homebrew}/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"

# Extra PATH entries are added only when the directory exists.
# Do not assign PATH directly here.
typeset -ga DOTDOTDOT_PATH_PREPEND=()
typeset -ga DOTDOTDOT_PATH_APPEND=()
