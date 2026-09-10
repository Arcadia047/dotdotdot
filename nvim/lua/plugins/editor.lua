return {
	{
		"nvim-tree/nvim-web-devicons",
		lazy = true,
		opts = {},
	},
	{
		"nvim-telescope/telescope.nvim",
		cmd = "Telescope",
		keys = {
			{
				"<leader><space>",
				function()
					require("telescope.builtin").find_files({ hidden = true })
				end,
				desc = "Find Files",
			},
			{
				"<leader>/",
				function()
					require("telescope.builtin").live_grep()
				end,
				desc = "Live Grep",
			},
			{
				"<leader>fb",
				function()
					require("config.navigation").in_editor(function()
						require("telescope.builtin").buffers()
					end)
				end,
				desc = "Buffers",
			},
			{
				"<leader>fc",
				function()
					require("telescope.builtin").commands()
				end,
				desc = "Commands",
			},
			{
				"<leader>fg",
				function()
					require("telescope.builtin").git_files()
				end,
				desc = "Git Files",
			},
			{
				"<leader>fh",
				function()
					require("telescope.builtin").help_tags()
				end,
				desc = "Help Tags",
			},
			{
				"<leader>fk",
				function()
					require("telescope.builtin").keymaps()
				end,
				desc = "Keymaps",
			},
			{
				"<leader>fr",
				function()
					require("telescope.builtin").oldfiles()
				end,
				desc = "Recent Files",
			},
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "make",
				cond = function()
					return vim.fn.executable("make") == 1
				end,
			},
		},
		opts = function()
			local actions = require("telescope.actions")
			return {
				defaults = {
					prompt_prefix = "> ",
					selection_caret = "> ",
					sorting_strategy = "ascending",
					layout_config = { prompt_position = "top" },
					mappings = {
						i = {
							["<Esc>"] = actions.close,
							-- Prompts keep text editing; Esc closes the modal.
							["<C-h>"] = { "<C-h>", type = "command" },
							["<C-j>"] = function() end,
							["<C-k>"] = function() end,
							["<C-l>"] = function() end,
						},
					},
				},
				pickers = { find_files = { hidden = true } },
			}
		end,
		config = function(_, opts)
			local telescope = require("telescope")
			telescope.setup(opts)
			pcall(telescope.load_extension, "fzf")
		end,
	},
	{
		"nvim-neo-tree/neo-tree.nvim",
		branch = "v3.x",
		cmd = "Neotree",
		keys = {
			{ "<leader>e", "<cmd>Neotree toggle reveal<cr>", desc = "File Tree" },
			{ "-", "<cmd>Neotree reveal<cr>", desc = "Reveal File in Tree" },
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
			"MunifTanjim/nui.nvim",
			"nvim-tree/nvim-web-devicons",
		},
		opts = {
			close_if_last_window = true,
			enable_git_status = true,
			filesystem = {
				bind_to_cwd = false,
				follow_current_file = { enabled = true },
				use_libuv_file_watcher = true,
				filtered_items = {
					hide_dotfiles = false,
					hide_gitignored = false,
				},
			},
			window = {
				width = 34,
				-- Space is the shared leader, including Which-key discovery.
				mappings = { ["<space>"] = "none" },
			},
		},
	},
	{
		"akinsho/bufferline.nvim",
		event = "VeryLazy",
		dependencies = { "nvim-tree/nvim-web-devicons", "catppuccin/nvim" },
		keys = {
			{
				"[b",
				function()
					require("config.navigation").buffer("BufferLineCyclePrev")
				end,
				desc = "Previous Buffer",
			},
			{
				"]b",
				function()
					require("config.navigation").buffer("BufferLineCycleNext")
				end,
				desc = "Next Buffer",
			},
			{
				"<leader>bp",
				function()
					require("config.navigation").buffer("BufferLineTogglePin")
				end,
				desc = "Pin Buffer",
			},
			{
				"<leader>bc",
				function()
					require("config.navigation").buffer("BufferLineCloseOthers")
				end,
				desc = "Close Other Buffers",
			},
			{
				"<leader>bd",
				function()
					require("config.navigation").buffer("confirm bdelete")
				end,
				desc = "Close Current Buffer",
			},
			-- Visible buffer ordinals match tmux window numbers.
			{
				"<leader>1",
				function()
					require("config.navigation").buffer_number(1)
				end,
				desc = "Buffer 1",
			},
			{
				"<leader>2",
				function()
					require("config.navigation").buffer_number(2)
				end,
				desc = "Buffer 2",
			},
			{
				"<leader>3",
				function()
					require("config.navigation").buffer_number(3)
				end,
				desc = "Buffer 3",
			},
			{
				"<leader>4",
				function()
					require("config.navigation").buffer_number(4)
				end,
				desc = "Buffer 4",
			},
			{
				"<leader>5",
				function()
					require("config.navigation").buffer_number(5)
				end,
				desc = "Buffer 5",
			},
			{
				"<leader>6",
				function()
					require("config.navigation").buffer_number(6)
				end,
				desc = "Buffer 6",
			},
			{
				"<leader>7",
				function()
					require("config.navigation").buffer_number(7)
				end,
				desc = "Buffer 7",
			},
			{
				"<leader>8",
				function()
					require("config.navigation").buffer_number(8)
				end,
				desc = "Buffer 8",
			},
			{
				"<leader>9",
				function()
					require("config.navigation").buffer_number(9)
				end,
				desc = "Buffer 9",
			},
		},
		opts = function()
			return {
				highlights = require("catppuccin.special.bufferline").get_theme(),
				options = {
					numbers = "ordinal",
					diagnostics = "nvim_lsp",
					always_show_bufferline = false,
					separator_style = "thin",
					offsets = { { filetype = "neo-tree", text = "Files", text_align = "left" } },
				},
			}
		end,
	},
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = { preset = "classic" },
		config = function(_, opts)
			local wk = require("which-key")
			wk.setup(opts)
			wk.add({
				{ "<leader>D", group = "Debug" },
				{ "<leader>Dg", group = "Debug Go" },
				{ "<leader>Dp", group = "Debug Python" },
				{ "<leader>b", group = "Buffers" },
				{ "<leader>bd", desc = "Close Current Buffer" },
				{ "<leader>c", group = "Code" },
				{ "<leader>d", group = "Database" },
				{ "<leader>f", group = "Find" },
				{ "<leader>g", group = "Git" },
				{ "<leader>h", group = "Git Hunk" },
				{ "<leader>r", group = "Run" },
				{ "<leader>s", group = "Session" },
				{ "<leader>u", group = "UI" },
				{ "<leader>v", group = "Vim Training" },
				{ "<leader>w", group = "Windows" },
				{ "<leader>x", group = "Diagnostics" },
			})
		end,
	},
	{
		"m4xshen/hardtime.nvim",
		version = "1.*",
		lazy = false,
		dependencies = { "MunifTanjim/nui.nvim" },
		keys = {
			{ "<leader>vt", "<cmd>Hardtime toggle<cr>", desc = "Toggle Vim Training" },
			{ "<leader>vr", "<cmd>Hardtime report<cr>", desc = "Vim Habit Report" },
		},
		opts = {
			enabled = true,
			hint = true,
			notification = true,
			timeout = 2500,
			restriction_mode = "hint",
			disable_mouse = false,
			disabled_keys = {
				["<Up>"] = false,
				["<Down>"] = false,
				["<Left>"] = false,
				["<Right>"] = false,
			},
		},
	},
	{
		"folke/persistence.nvim",
		lazy = false,
		opts = {},
		keys = {
			{
				"<leader>sl",
				function()
					require("persistence").load()
				end,
				desc = "Restore Session",
			},
			{
				"<leader>ss",
				function()
					require("persistence").select()
				end,
				desc = "Select Session",
			},
			{
				"<leader>sd",
				function()
					require("persistence").stop()
				end,
				desc = "Stop Session Saving",
			},
		},
		config = function(_, opts)
			local persistence = require("persistence")
			persistence.setup(opts)
			vim.api.nvim_create_autocmd("VimEnter", {
				once = true,
				callback = function()
					local argc = vim.fn.argc()
					local restore = argc == 0
					if argc == 1 then
						local arg = vim.fn.argv(0)
						restore = vim.fn.isdirectory(arg) == 1
					end
					if restore then
						vim.schedule(function()
							pcall(persistence.load)
						end)
					end
				end,
			})
		end,
	},
	{
		"aznhe21/actions-preview.nvim",
		keys = {
			{
				"<leader>ca",
				function()
					require("actions-preview").code_actions()
				end,
				mode = { "n", "x" },
				desc = "Code Action (Preview)",
			},
		},
		opts = {
			backend = { "telescope" },
			diff = { algorithm = "patience", ignore_whitespace = true },
		},
	},
	{
		"lewis6991/gitsigns.nvim",
		event = { "BufReadPre", "BufNewFile" },
		opts = {
			current_line_blame = false,
			on_attach = function(bufnr)
				local gs = require("gitsigns")
				local function map(mode, lhs, rhs, desc)
					vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, desc = desc })
				end

				map("n", "]h", function()
					if vim.wo.diff then
						vim.cmd.normal({ "]h", bang = true })
						return
					end
					vim.schedule(gs.next_hunk)
				end, "Next Hunk")
				map("n", "[h", function()
					if vim.wo.diff then
						vim.cmd.normal({ "[h", bang = true })
						return
					end
					vim.schedule(gs.prev_hunk)
				end, "Previous Hunk")
				map("n", "<leader>hs", gs.stage_hunk, "Stage Hunk")
				map("n", "<leader>hr", gs.reset_hunk, "Reset Hunk")
				map("n", "<leader>hS", gs.stage_buffer, "Stage Buffer")
				map("n", "<leader>hu", gs.undo_stage_hunk, "Undo Stage Hunk")
				map("n", "<leader>hR", gs.reset_buffer, "Reset Buffer")
				map("n", "<leader>hp", gs.preview_hunk, "Preview Hunk")
				map("n", "<leader>hb", gs.blame_line, "Blame Line")
				map("n", "<leader>hB", gs.toggle_current_line_blame, "Toggle Line Blame")
				map("n", "<leader>hd", gs.diffthis, "Diff This")
				map({ "o", "x" }, "ih", gs.select_hunk, "Select Hunk")
			end,
		},
	},
	{
		"folke/trouble.nvim",
		cmd = "Trouble",
		keys = {
			{ "<leader>xx", "<cmd>Trouble diagnostics toggle<cr>", desc = "Diagnostics" },
			{ "<leader>xX", "<cmd>Trouble diagnostics toggle filter.buf=0<cr>", desc = "Buffer Diagnostics" },
			{ "<leader>xq", "<cmd>Trouble qflist toggle<cr>", desc = "Quickfix List" },
			{ "<leader>xl", "<cmd>Trouble loclist toggle<cr>", desc = "Location List" },
		},
		opts = { auto_preview = false, focus = false, follow = true },
	},
}
