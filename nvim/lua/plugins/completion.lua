return {
	{
		"saghen/blink.cmp",
		version = "1.*",
		lazy = false,
		opts = {
			sources = {
				-- Keep LSP trigger/signature discovery available; gate the menu items
				-- with Blink's context-aware provider hooks below.
				default = { "lsp", "path", "buffer" },
				per_filetype = { sql = { inherit_defaults = true, "dadbod" } },
				providers = {
					lsp = {
						should_show_items = require("config.completion").allow("lsp"),
						fallbacks = function(ctx)
							return ctx.trigger.initial_kind == "manual" and { "buffer" } or {}
						end,
					},
					buffer = {
						should_show_items = require("config.completion").allow("buffer"),
						max_items = 10,
						min_keyword_length = 3,
						opts = { get_bufnrs = require("config.completion").project_buffers },
					},
					path = {
						should_show_items = require("config.completion").allow("path"),
					},
					snippets = {
						max_items = 8,
						score_offset = -3,
						opts = {
							friendly_snippets = false,
							search_paths = { vim.fn.stdpath("config") .. "/snippets" },
						},
					},
					dadbod = {
						should_show_items = require("config.completion").allow("dadbod"),
						name = "Database",
						module = "vim_dadbod_completion.blink",
					},
				},
			},
			fuzzy = {
				implementation = "prefer_rust",
			},
			completion = {
				accept = { auto_brackets = { enabled = false } },
				trigger = { show_in_snippet = false },
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
				["<C-Space>"] = { require("config.completion").show },
				["<C-x><C-s>"] = {
					function(cmp)
						return cmp.show({ providers = { "snippets" } })
					end,
				},
				["<C-k>"] = false, -- Reserved for tmux task switching; signature help opens automatically.
				["<Tab>"] = { "snippet_forward", "select_next", "fallback" },
				["<S-Tab>"] = { "snippet_backward", "select_prev", "fallback" },
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
