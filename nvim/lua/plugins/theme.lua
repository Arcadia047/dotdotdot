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
			palette = theme.palettes(),
			styles = { transparency = false },
			groups = { ok = "foam", h6 = "foam" },
			highlight_groups = vim.tbl_extend("force", theme.bufferline_highlights(), {
				NormalFloat = { fg = "text", bg = "surface" },
				BlinkCmpLabel = { fg = "text" },
				BlinkCmpMenu = { fg = "text", bg = "surface" },
				BlinkCmpMenuBorder = { fg = "muted", bg = "surface" },
				-- These plugins otherwise supply fixed colors outside Rosé Pine.
				MasonHeader = { fg = "surface", bg = "pine", bold = true },
				MasonHeaderSecondary = { fg = "base", bg = "love", bold = true },
				MasonHighlight = { fg = "pine" },
				MasonHighlightBlock = { fg = "surface", bg = "pine" },
				MasonHighlightBlockBold = { fg = "surface", bg = "pine", bold = true },
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
				NeoTreeNormal = { fg = "text", bg = "surface" },
				NeoTreeNormalNC = { fg = "text", bg = "surface" },
				NeoTreeFloatNormal = { fg = "text", bg = "surface" },
			}),
		},
		config = function(_, opts)
			vim.o.background = theme_mode
			require("rose-pine").setup(opts)
			vim.api.nvim_create_autocmd("ColorScheme", {
				group = vim.api.nvim_create_augroup("UserTerminalPalette", { clear = true }),
				callback = function()
					theme.apply_terminal_palette(theme.mode())
				end,
			})
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
				-- Colorscheme/plugin repaint hooks must run inside this focus event.
				nested = true,
				callback = refresh,
			})
			theme.watch(refresh)
		end,
	},
}
