local M = {}
local source = vim.fn.resolve(debug.getinfo(1, "S").source:sub(2))
local directory = vim.fn.fnamemodify(source, ":h") .. "/../../../theme"
local palette = dofile(directory .. "/palette.lua")(directory .. "/palette.tsv")

function M.colors(mode)
	return palette.get(mode)
end

function M.palettes()
	local main, dawn = M.colors("dark"), M.colors("light")
	-- The installed port adds a leaf role; keep it on the shared success accent.
	main.leaf, dawn.leaf = main.foam, dawn.foam
	return { main = main, dawn = dawn }
end

function M.bufferline_highlights()
	local groups = {
		BufferLineFill = { fg = "subtle", bg = "base" },
		BufferLineTab = { fg = "subtle", bg = "surface" },
		BufferLineTabSelected = { fg = "text", bg = "overlay", bold = true },
		BufferLineTabClose = { fg = "love", bg = "surface" },
		BufferLineOffsetSeparator = { fg = "highlight_high", bg = "base" },
	}
	for _, state in ipairs({ "", "Visible", "Selected" }) do
		local bg = state == "Selected" and "overlay" or "surface"
		local fg = state == "" and "subtle" or "text"
		for _, name in ipairs({ "Buffer", "Numbers", "CloseButton", "Duplicate", "Diagnostic" }) do
			groups["BufferLine" .. name .. state] = { fg = fg, bg = bg, bold = state == "Selected" }
		end
		groups["BufferLineModified" .. state] = { fg = "gold", bg = bg }
		groups["BufferLineSeparator" .. state] = { fg = "base", bg = bg }
		groups["BufferLineIndicator" .. state] = { fg = "iris", bg = bg }
		for name, role in pairs({ Error = "love", Warning = "gold", Info = "foam", Hint = "iris" }) do
			groups["BufferLine" .. name .. state] = { fg = role, bg = bg }
			groups["BufferLine" .. name .. "Diagnostic" .. state] = { fg = role, bg = bg }
		end
	end
	groups.BufferLineBackground = { fg = "subtle", bg = "surface" }
	return groups
end

function M.apply_terminal_palette(mode)
	local ansi, brights = palette.ansi(palette.get(mode))
	for index = 1, 8 do
		vim.g["terminal_color_" .. (index - 1)] = ansi[index]
		vim.g["terminal_color_" .. (index + 7)] = brights[index]
	end
end

local function read_mode(file)
	local ok, lines = pcall(vim.fn.readfile, file)
	return ok and lines[1] and vim.trim(lines[1]) or nil
end

function M.mode()
	local config = vim.env.XDG_CONFIG_HOME or vim.fn.expand("~/.config")
	local mode = read_mode(config .. "/dotfiles-theme")
	if mode == "dark" or mode == "light" then
		return mode
	end
	if mode == "auto" then
		local system = read_mode(config .. "/dotfiles-theme-system")
		if system == "dark" or system == "light" then
			return system
		end
		local result = vim.system({ "/usr/bin/defaults", "read", "-g", "AppleInterfaceStyle" }, { text = true })
			:wait(1000)
		return result.code == 0 and vim.trim(result.stdout or "") == "Dark" and "dark" or "light"
	end
	return vim.env.DOTFILES_THEME == "dark" and "dark" or "light"
end

function M.watch(callback)
	if M.watcher then
		M.watcher:stop()
		M.watcher:close()
	end
	-- Read two tiny local files once a second. macOS FSEvents may refuse new
	-- watches (EMFILE); a timer also survives atomic renames and missing files.
	-- The OS appearance query only runs when auto's published cache is absent.
	M.watcher = assert(vim.uv.new_timer())
	M.watcher:start(1000, 1000, vim.schedule_wrap(callback))
	vim.api.nvim_create_autocmd("VimLeavePre", {
		group = vim.api.nvim_create_augroup("UserThemeWatcher", { clear = true }),
		callback = function()
			if M.watcher and not M.watcher:is_closing() then
				M.watcher:stop()
				M.watcher:close()
			end
		end,
	})
end

function M.variant(mode)
	return mode == "dark" and "main" or "dawn"
end

return M
