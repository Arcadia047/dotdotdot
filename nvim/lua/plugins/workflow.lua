return {
	{
		"stevearc/overseer.nvim",
		cmd = { "OverseerRun", "OverseerToggle", "OverseerOpen", "OverseerClose" },
		keys = {
			{
				"<leader>rr",
				function()
					require("config.runner").run()
				end,
				desc = "Run Current Context",
			},
			{ "<leader>rt", "<cmd>OverseerRun<cr>", desc = "Choose Project Task" },
			{ "<leader>rl", "<cmd>OverseerRestartLast<cr>", desc = "Restart Last Task" },
			{ "<leader>ro", "<cmd>OverseerToggle<cr>", desc = "Toggle Task Output" },
		},
		opts = {
			strategy = { "terminal", direction = "bottom", auto_scroll = true, quit_on_exit = "never" },
			task_list = { direction = "bottom", min_height = 8, max_height = 20 },
		},
	},
	{
		"MeanderingProgrammer/render-markdown.nvim",
		ft = { "markdown" },
		dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" },
		opts = {
			completions = { lsp = { enabled = true } },
			heading = { sign = false },
			code = { border = "thin", sign = false, width = "block" },
		},
	},
	{
		"kristijanhusak/vim-dadbod-ui",
		cmd = { "DBUI", "DBUIToggle", "DBUIAddConnection", "DBUIFindBuffer" },
		keys = {
			{ "<leader>db", "<cmd>DBUIToggle<cr>", desc = "Database UI" },
			{ "<leader>da", "<cmd>DBUIAddConnection<cr>", desc = "Add Database Connection" },
			{ "<leader>df", "<cmd>DBUIFindBuffer<cr>", desc = "Find Database Buffer" },
		},
		dependencies = {
			{ "tpope/vim-dadbod", lazy = false },
			{ "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" } },
		},
		init = function()
			vim.g.db_ui_use_nerd_fonts = 1
			vim.g.db_ui_save_location = vim.fn.stdpath("state") .. "/db_ui"
			vim.g.db_ui_tmp_query_location = vim.fn.stdpath("state") .. "/db_ui/queries"
			vim.g.db_ui_execute_on_save = 0

			local dbs = {}
			if vim.env.DATABASE_URL and vim.env.DATABASE_URL ~= "" then
				dbs.default = vim.env.DATABASE_URL
				vim.g.db = vim.env.DATABASE_URL
			end
			if vim.env.SQLITE_DATABASE and vim.env.SQLITE_DATABASE ~= "" then
				dbs.sqlite = "sqlite:" .. vim.env.SQLITE_DATABASE
				vim.g.db = vim.g.db or dbs.sqlite
			end
			if next(dbs) then
				vim.g.dbs = dbs
			end

			local local_config = vim.fn.stdpath("config") .. "-local/db.lua"
			if vim.fn.filereadable(local_config) == 1 then
				local ok, err = pcall(dofile, local_config)
				if not ok then
					vim.schedule(function()
						vim.notify("Local database config failed: " .. err, vim.log.levels.ERROR)
					end)
				end
			end

			vim.api.nvim_create_autocmd("FileType", {
				group = vim.api.nvim_create_augroup("UserDadbodMaps", { clear = true }),
				pattern = { "sql", "mysql", "plsql" },
				callback = function(args)
					vim.keymap.set("n", "<leader>de", function()
						require("config.database").execute("statement")
					end, { buffer = args.buf, desc = "Execute SQL Statement" })
					vim.keymap.set("x", "<leader>de", function()
						require("config.database").execute("selection")
					end, { buffer = args.buf, desc = "Execute SQL Selection" })
					vim.keymap.set("n", "<leader>dE", function()
						require("config.database").execute("buffer")
					end, { buffer = args.buf, desc = "Execute SQL Buffer" })
				end,
			})
		end,
	},
}
