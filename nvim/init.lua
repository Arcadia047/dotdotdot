vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- The configuration has no remote-host plugins; disabling their providers
-- avoids runtime-manager coupling and irrelevant health warnings.
vim.g.loaded_node_provider = 0
vim.g.loaded_perl_provider = 0
vim.g.loaded_python3_provider = 0
vim.g.loaded_ruby_provider = 0

require("config.options")
require("config.keymaps")
require("config.autocmds")
require("config.lazy")
