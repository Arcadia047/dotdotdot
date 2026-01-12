return {
	{
		"saghen/blink.cmp",
		opts = {
			completion = {
				list = {
					-- DISABLE auto-selection. You must select manually.
					selection = { preselect = false, auto_insert = false },
				},
				-- Remove "ghost text" (gray preview text inline)
				ghost_text = { enabled = false },
				documentation = { auto_show = true, auto_show_delay_ms = 200 },
			},
			keymap = {
				preset = "default",
				-- TAB: Select Next Item (Cycle Down)
				["<Tab>"] = { "select_next", "fallback" },
				-- SHIFT+TAB: Select Previous Item (Cycle Up)
				["<S-Tab>"] = { "select_prev", "fallback" },
				-- Only accept on Enter.
				["<CR>"] = { "accept", "fallback" },
			},
		},
	},

	-- We keep this for HTML templates, but completion won't auto-expand them.
	{
		"L3MON4D3/LuaSnip",
		keys = function()
			return {}
		end, -- Disable default heavy keybinds
	},
}
