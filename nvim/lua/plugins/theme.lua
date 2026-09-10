local theme = require("config.theme")
local theme_mode = theme.mode()

return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		lazy = false,
		priority = 1000,
		opts = {
			flavour = theme.flavor(theme_mode),
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
			vim.cmd.colorscheme("catppuccin-" .. theme.flavor(theme_mode))
			vim.api.nvim_create_autocmd("FocusGained", {
				group = vim.api.nvim_create_augroup("UserTheme", { clear = true }),
				callback = function()
					local mode = theme.mode()
					if mode ~= theme_mode then
						theme_mode = mode
						vim.o.background = mode
						vim.cmd.colorscheme("catppuccin-" .. theme.flavor(mode))
					end
				end,
			})
		end,
	},
}
