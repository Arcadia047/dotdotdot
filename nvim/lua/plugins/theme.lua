-- The single source of truth is the repo's theme.conf (installed by bootstrap as
-- ~/.config/dotfiles-theme and shared with WezTerm and tmux). WezTerm's
-- DOTFILES_THEME env var is a secondary fallback; "dark" is the final default.
local function resolve_theme_mode()
	local ok, lines = pcall(vim.fn.readfile, vim.fn.expand("~/.config/dotfiles-theme"))
	if ok and lines and #lines > 0 and lines[1]:match("^%s*light%s*$") then
		return "light"
	end
	if vim.env.DOTFILES_THEME == "light" then
		return "light"
	end
	return "dark"
end

local theme_mode = resolve_theme_mode()
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
