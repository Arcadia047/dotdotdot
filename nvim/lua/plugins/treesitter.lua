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
	"hcl",
	"javascript",
	"jsdoc",
	"json",
	"java",
	"kotlin",
	"lua",
	"markdown",
	"markdown_inline",
	"python",
	"query",
	"scala",
	"sql",
	"terraform",
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
	cuda = true,
	css = true,
	go = true,
	html = true,
	hcl = true,
	javascript = true,
	json = true,
	jsonc = true,
	kotlin = true,
	python = true,
	scala = true,
	sql = true,
	terraform = true,
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

			vim.treesitter.language.register("cpp", "cuda")
			local pending, failed = {}, {}
			local function attach(bufnr, language)
				if not vim.api.nvim_buf_is_valid(bufnr) then
					return
				end
				local ft = vim.bo[bufnr].filetype
				if (vim.treesitter.language.get_lang(ft) or ft) ~= language then
					return
				end
				local ok = pcall(vim.treesitter.start, bufnr, language)
				if ok and indent_filetypes[ft] then
					vim.bo[bufnr].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
				end
				return ok
			end
			local function ensure(bufnr)
				if not vim.api.nvim_buf_is_valid(bufnr) or vim.bo[bufnr].buftype ~= "" then
					return
				end
				local ft = vim.bo[bufnr].filetype
				local language = vim.treesitter.language.get_lang(ft) or ft
				if attach(bufnr, language) or failed[language] then
					return
				end
				if not vim.tbl_contains(parsers, language) then
					return
				end
				if pending[language] then
					pending[language][bufnr] = true
					return
				end
				pending[language] = { [bufnr] = true }
				local function install_parser(ready)
					if not ready then
						pending[language] = nil
						failed[language] = true
						return
					end
					treesitter.install({ language }):await(function(err, installed)
						vim.schedule(function()
							local buffers = pending[language] or {}
							pending[language] = nil
							if err or not installed then
								failed[language] = true
								vim.notify(
									"Parser installation failed for " .. language .. "; :ToolingInstall retries",
									vim.log.levels.ERROR
								)
								return
							end
							for buf in pairs(buffers) do
								attach(buf, language)
							end
						end)
					end)
				end
				if vim.fn.executable("tree-sitter") == 1 then
					install_parser(true)
				else
					require("config.tools").install({ "tree-sitter-cli" }, install_parser)
				end
			end
			vim.api.nvim_create_autocmd("FileType", {
				group = vim.api.nvim_create_augroup("UserTreesitter", { clear = true }),
				callback = function(args)
					vim.schedule(function()
						ensure(args.buf)
					end)
				end,
			})
			vim.api.nvim_create_autocmd("User", {
				group = "UserTreesitter",
				pattern = "LanguageToolsRetry",
				callback = function()
					failed = {}
					ensure(vim.api.nvim_get_current_buf())
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
