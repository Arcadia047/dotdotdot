local theme = require("config.theme")
local theme_mode = theme.mode()

return {
	{
		"rose-pine/neovim",
		name = "rose-pine",
		lazy = false,
		priority = 1000,
		opts = {
			variant = "auto",
			dark_variant = "main",
			styles = { transparency = false },
			highlight_groups = {
				BlinkCmpLabel = { fg = "text" },
				BlinkCmpMenu = { fg = "text", bg = "surface" },
				BlinkCmpMenuBorder = { fg = "muted", bg = "surface" },
				-- These plugins otherwise supply fixed colors outside Rosé Pine.
				MasonHeader = { fg = "base", bg = "pine", bold = true },
				MasonHeaderSecondary = { fg = "base", bg = "love", bold = true },
				MasonHighlight = { fg = "pine" },
				MasonHighlightBlock = { fg = "base", bg = "pine" },
				MasonHighlightBlockBold = { fg = "base", bg = "pine", bold = true },
				MasonHighlightSecondary = { fg = "love" },
				MasonHighlightBlockSecondary = { fg = "base", bg = "love" },
				MasonHighlightBlockBoldSecondary = { fg = "base", bg = "love", bold = true },
				MasonMuted = { fg = "subtle" },
				MasonMutedBlock = { fg = "text", bg = "overlay" },
				MasonMutedBlockBold = { fg = "text", bg = "overlay", bold = true },
				dbui_connection_ok = { link = "DiagnosticOk" },
				dbui_connection_error = { link = "DiagnosticError" },
				DapBreakpoint = { fg = "love" },
				DapBreakpointCondition = { fg = "gold" },
				DapBreakpointRejected = { fg = "muted" },
				DapLogPoint = { fg = "foam" },
				DapStopped = { fg = "gold" },
			},
		},
		config = function(_, opts)
			vim.o.background = theme_mode
			require("rose-pine").setup(opts)
			vim.cmd.colorscheme("rose-pine")
			local function refresh()
				local mode = theme.mode()
				if mode ~= theme_mode then
					theme_mode = mode
					vim.o.background = mode
					vim.cmd.colorscheme("rose-pine")
				end
			end
			vim.api.nvim_create_autocmd("FocusGained", {
				group = vim.api.nvim_create_augroup("UserTheme", { clear = true }),
				callback = refresh,
			})
			theme.watch(refresh)
		end,
	},
}
