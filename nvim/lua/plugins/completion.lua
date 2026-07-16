return {
	{
		"saghen/blink.cmp",
		version = "1.*",
		lazy = false,
		opts = {
			sources = {
				default = { "lsp", "path", "snippets", "buffer" },
				per_filetype = {
					sql = { inherit_defaults = true, "dadbod" },
				},
				providers = {
					lsp = { fallbacks = {} },
					buffer = { max_items = 10, min_keyword_length = 3 },
					snippets = {
						max_items = 8,
						score_offset = -3,
						opts = {
							friendly_snippets = false,
							search_paths = { vim.fn.stdpath("config") .. "/snippets" },
						},
					},
					dadbod = {
						name = "Database",
						module = "vim_dadbod_completion.blink",
					},
				},
			},
			fuzzy = {
				implementation = "prefer_rust",
			},
			completion = {
				list = {
					selection = { preselect = false, auto_insert = false },
				},
				ghost_text = { enabled = false },
				documentation = { auto_show = true, auto_show_delay_ms = 200 },
				menu = {
					draw = {
						columns = {
							{ "kind_icon" },
							{ "label", "label_description", gap = 1 },
							{ "source_name" },
						},
					},
				},
			},
			signature = { enabled = true },
			keymap = {
				preset = "default",
				["<Tab>"] = { "select_next", "snippet_forward", "fallback" },
				["<S-Tab>"] = { "select_prev", "snippet_backward", "fallback" },
				["<CR>"] = { "accept", "fallback" },
				["<C-e>"] = { "hide", "fallback" },
			},
		},
	},
	{
		"echasnovski/mini.pairs",
		event = "VeryLazy",
		opts = {},
	},
}
