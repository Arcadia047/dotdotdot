local M = {}
local directions = { h = "Left", j = "Down", k = "Up", l = "Right" }

-- Buffer commands act in an editing window, even when invoked from Neo-tree
-- or a task panel. Never replace a sidebar with an ordinary file buffer.
function M.in_editor(action)
	local function is_editor(win)
		return vim.api.nvim_win_get_config(win).relative == "" and vim.bo[vim.api.nvim_win_get_buf(win)].buftype == ""
	end
	local current = vim.api.nvim_get_current_win()
	if not is_editor(current) then
		local previous = vim.fn.win_getid(vim.fn.winnr("#"))
		local target = vim.api.nvim_win_is_valid(previous) and is_editor(previous) and previous or nil
		for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
			if not target and is_editor(win) then
				target = win
			end
		end
		if not target then
			vim.notify("Open a file in an editing window first", vim.log.levels.INFO)
			return
		end
		vim.api.nvim_set_current_win(target)
	end
	action()
end

function M.buffer(command)
	M.in_editor(function()
		vim.cmd(command)
	end)
end

function M.buffer_number(number)
	M.in_editor(function()
		local bufferline = require("bufferline")
		if bufferline.get_elements().elements[number] then
			-- The Ex command uses only currently visible tabs, which changes
			-- numbering in narrow panes. Use the complete ordered list.
			bufferline.go_to(number, true)
		end
	end)
end

function M.cycle_buffer(direction)
	M.in_editor(function()
		require("bufferline").cycle(direction)
	end)
end

function M.resize()
	vim.api.nvim_echo({ { "Resize: h/l width, k/j height; Esc/Enter exits", "ModeMsg" } }, false, {})
	while true do
		local ok, key = pcall(vim.fn.getcharstr)
		if not ok or not directions[key] then
			break
		end
		local commands = { h = "vertical resize -3", l = "vertical resize +3", k = "resize -2", j = "resize +2" }
		vim.cmd(commands[key])
		vim.cmd.redraw()
	end
	vim.api.nvim_echo({ { "", "None" } }, false, {})
end

function M.setup()
	local map = vim.keymap.set
	-- Clear the old pane mappings as well when this module is reloaded live.
	for key, direction in pairs(directions) do
		for _, mode in ipairs({ "n", "i", "t" }) do
			pcall(vim.keymap.del, mode, "<C-" .. key .. ">")
		end
		map("n", "<leader>w" .. key, "<C-w>" .. key, { desc = "Editor Focus " .. direction })
		map("n", "<leader>w" .. key:upper(), "<C-w>" .. key:upper(), { desc = "Move Split " .. direction })
	end
	for key, direction in pairs({ h = -1, l = 1 }) do
		local command = "<Cmd>lua require('config.navigation').cycle_buffer(" .. direction .. ")<CR>"
		local desc = direction == -1 and "Previous Buffer" or "Next Buffer"
		map("n", "<C-" .. key .. ">", command, { desc = desc })
		map("i", "<C-" .. key .. ">", function()
			-- Floating prompts retain text editing until dismissed with Esc.
			if vim.bo.buftype == "prompt" or vim.api.nvim_win_get_config(0).relative ~= "" then
				return "<C-" .. key .. ">"
			end
			return "<Esc>" .. command
		end, { expr = true, desc = desc })
		map("t", "<C-" .. key .. ">", "<C-\\><C-n>" .. command, { desc = desc })
	end
	map("n", "<leader><Tab>", function()
		M.buffer("buffer #")
	end, { desc = "Alternate Buffer" })
	map("n", "<leader>w|", "<Cmd>vsplit<CR>", { desc = "Split Right" })
	map("n", "<leader>w-", "<Cmd>split<CR>", { desc = "Split Below" })
	map("n", "<leader>wx", "<Cmd>close<CR>", { desc = "Close Window" })
	map("n", "<leader>wr", M.resize, { desc = "Resize Windows" })
end

return M
