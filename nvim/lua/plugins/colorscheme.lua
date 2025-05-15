return {
	{
		"catppuccin/nvim",
		name = "catppuccin",
		priority = 1000,
		-- "shaunsingh/nord.nvim",
		-- priority = 1000,
		config = function()
			vim.cmd([[ colorscheme catppuccin-macchiato ]])
			-- vim.cmd([[ colorscheme nord ]])
		end,
	},
}
