local theme_mode = vim.env.DOTFILES_THEME == "light" and "light" or "dark"
local flavors = {
	dark = "macchiato",
	light = "latte",
}

return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		lazy = false,
		priority = 1000,
		opts = {
			flavour = flavors[theme_mode],
			background = {
				light = "latte",
				dark = "macchiato",
			},
			transparent_background = false,
			integrations = {
				blink_cmp = { style = "bordered" },
				dap = true,
				gitsigns = true,
				lsp_trouble = true,
				mason = true,
				neotree = true,
				overseer = true,
				render_markdown = true,
				telescope = { enabled = true },
				vim_dadbod_ui = true,
				which_key = true,
			},
		},
		config = function(_, opts)
			vim.o.background = theme_mode
			require("catppuccin").setup(opts)
			vim.cmd.colorscheme("catppuccin-" .. flavors[theme_mode])
		end,
	},
}
