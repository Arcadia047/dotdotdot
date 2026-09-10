# Copy to ~/.config/dotdotdot/machine.zsh. Bootstrap never overwrites it.
# JDKs are identified by their release files, including custom JAVA_HOME paths
# and Homebrew's unversioned openjdk keg. Missing explicit choices are errors.

# Optional project/standalone Java default in Neovim. Otherwise JAVA_HOME wins,
# then the newest installed JDK. Project Maven/Gradle toolchains remain in charge.
# export DOTDOTDOT_JAVA_VERSION=17

# Independent Java 21+ runtime for jdtls (defaults to newest installed).
# export DOTDOTDOT_JDTLS_JAVA_VERSION=25

# Set only if every shell on this Mac should use a particular JDK.
# export JAVA_HOME="${HOMEBREW_PREFIX:-/opt/homebrew}/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

# Extra PATH entries are added only when the directory exists.
typeset -ga DOTDOTDOT_PATH_PREPEND=()
typeset -ga DOTDOTDOT_PATH_APPEND=()
