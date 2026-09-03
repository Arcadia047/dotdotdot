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

return {
	{
		"rose-pine/neovim",
		name = "rose-pine",
		lazy = false,
		priority = 1000,
		opts = {
			-- "auto" selects dawn when background=light, dark_variant when dark.
			dark_variant = "main",
			dim_inactive_windows = false,
			extend_background_behind_borders = true,
		},
		config = function(_, opts)
			vim.o.background = theme_mode
			require("rose-pine").setup(opts)
			vim.cmd.colorscheme(theme_mode == "light" and "rose-pine-dawn" or "rose-pine")
		end,
	},
}
