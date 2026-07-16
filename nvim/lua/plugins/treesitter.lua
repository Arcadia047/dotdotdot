local parsers = {
	"bash",
	"c",
	"cpp",
	"css",
	"diff",
	"go",
	"gomod",
	"gosum",
	"gowork",
	"html",
	"javascript",
	"jsdoc",
	"json",
	"java",
	"lua",
	"markdown",
	"markdown_inline",
	"python",
	"query",
	"scala",
	"sql",
	"toml",
	"tsx",
	"typescript",
	"vim",
	"vimdoc",
	"xml",
	"yaml",
}

local indent_filetypes = {
	c = true,
	cpp = true,
	css = true,
	go = true,
	html = true,
	javascript = true,
	json = true,
	jsonc = true,
	python = true,
	scala = true,
	sql = true,
	tsx = true,
	typescript = true,
}

return {
	{
		"nvim-treesitter/nvim-treesitter",
		lazy = false,
		config = function()
			local treesitter = require("nvim-treesitter")
			treesitter.setup({ install_dir = vim.fn.stdpath("data") .. "/site" })

			vim.api.nvim_create_user_command("TSInstallConfigured", function()
				treesitter.install(parsers):wait(300000)
			end, { desc = "Install configured Treesitter parsers" })
			vim.api.nvim_create_user_command("TSUpdateConfigured", function()
				treesitter.update(parsers):wait(300000)
			end, { desc = "Update configured Treesitter parsers" })

			vim.api.nvim_create_autocmd("FileType", {
				group = vim.api.nvim_create_augroup("UserTreesitter", { clear = true }),
				callback = function(args)
					local filetype = vim.bo[args.buf].filetype
					local parser_lang = filetype == "jsonc" and "json" or filetype
					local ok = pcall(vim.treesitter.start, args.buf, parser_lang)

					if ok and indent_filetypes[filetype] then
						vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
					end
				end,
			})
		end,
	},
	{
		"nvim-treesitter/nvim-treesitter-textobjects",
		branch = "main",
		lazy = false,
		config = function()
			local select = require("nvim-treesitter-textobjects.select")
			local move = require("nvim-treesitter-textobjects.move")

			vim.keymap.set({ "x", "o" }, "af", function()
				select.select_textobject("@function.outer", "textobjects")
			end, { desc = "Around Function" })
			vim.keymap.set({ "x", "o" }, "if", function()
				select.select_textobject("@function.inner", "textobjects")
			end, { desc = "Inside Function" })
			vim.keymap.set({ "x", "o" }, "ac", function()
				select.select_textobject("@class.outer", "textobjects")
			end, { desc = "Around Class" })
			vim.keymap.set({ "x", "o" }, "ic", function()
				select.select_textobject("@class.inner", "textobjects")
			end, { desc = "Inside Class" })

			vim.keymap.set({ "n", "x", "o" }, "]m", function()
				move.goto_next_start("@function.outer", "textobjects")
			end, { desc = "Next Function Start" })
			vim.keymap.set({ "n", "x", "o" }, "[m", function()
				move.goto_previous_start("@function.outer", "textobjects")
			end, { desc = "Prev Function Start" })
			vim.keymap.set({ "n", "x", "o" }, "]M", function()
				move.goto_next_end("@function.outer", "textobjects")
			end, { desc = "Next Function End" })
			vim.keymap.set({ "n", "x", "o" }, "[M", function()
				move.goto_previous_end("@function.outer", "textobjects")
			end, { desc = "Prev Function End" })
		end,
	},
	{
		"folke/ts-comments.nvim",
		event = "VeryLazy",
		opts = {},
	},
	{
		"windwp/nvim-ts-autotag",
		event = { "BufReadPre", "BufNewFile" },
		opts = {
			opts = {
				enable_close = true,
				enable_rename = true,
				enable_close_on_slash = false,
			},
		},
	},
}
