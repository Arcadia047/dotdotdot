local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
	local lazyrepo = "https://github.com/folke/lazy.nvim.git"
	local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
	if vim.v.shell_error ~= 0 then
		vim.api.nvim_echo(
			{ { "Failed to clone lazy.nvim:\n", "ErrorMsg" }, { out, "WarningMsg" }, { "\nPress any key to exit..." } },
			true,
			{}
		)
		vim.fn.getchar()
		os.exit(1)
	end
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
	spec = {
		-- 1. LazyVim Core (Engine Only)
		{ "LazyVim/LazyVim", import = "lazyvim.plugins" },

		-- 2. BLOAT REMOVAL (Explicitly disable plugins we do not want)
		{ "catppuccin/nvim", enabled = false }, -- Incorrect theme
		{ "rcarriga/nvim-notify", enabled = false }, -- No fancy notifications
		{ "nvimdev/dashboard-nvim", enabled = false }, -- No startup screen
		{ "folke/flash.nvim", enabled = false }, -- No jump labels
		{ "folke/persistence.nvim", enabled = false }, -- No session restore

		-- 3. Language Support (LSP, Treesitter, Formatting, Mason included)
		{ import = "lazyvim.plugins.extras.formatting.prettier" },
		{ import = "lazyvim.plugins.extras.editor.neo-tree" },
		{ import = "lazyvim.plugins.extras.editor.telescope" },
		{ import = "lazyvim.plugins.extras.lang.java" }, -- Java 17+
		{ import = "lazyvim.plugins.extras.lang.scala" }, -- Scala
		{ import = "lazyvim.plugins.extras.lang.python" }, -- Python
		{ import = "lazyvim.plugins.extras.lang.go" }, -- Go
		{ import = "lazyvim.plugins.extras.lang.clangd" }, -- C
		{ import = "lazyvim.plugins.extras.lang.sql" }, -- SQL
		{ import = "lazyvim.plugins.extras.lang.typescript" }, -- TS/JS
		{ import = "lazyvim.plugins.extras.lang.tailwind" }, -- CSS/Tailwind
		{ import = "lazyvim.plugins.extras.lang.json" }, -- JSON

		-- 4. User Plugins
		{ import = "plugins" },
	},
	defaults = {
		lazy = false,
		version = false,
	},
	-- Force Tokyonight during install
	install = { colorscheme = { "tokyonight" } },
	checker = { enabled = true },
	performance = {
		rtp = {
			-- Disable built-in vim plugins we rarely use
			disabled_plugins = {
				"gzip",
				"matchit",
				"matchparen",
				"netrwPlugin",
				"tarPlugin",
				"tohtml",
				"tutor",
				"zipPlugin",
			},
		},
	},
})
