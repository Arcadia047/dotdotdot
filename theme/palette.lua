-- Plain Lua so both WezTerm and Neovim read the same role and ANSI definitions.
return function(file_path)
	local M = {}

	function M.get(mode)
		assert(mode == "light" or mode == "dark", "expected a resolved theme mode")
		local file = assert(io.open(file_path, "r"))
		local colors = {}
		for line in file:lines() do
			local role, main, dawn = line:match("^(%w[%w_]*)%s+(#%x+)%s+(#%x+)$")
			if role then
				colors[role] = mode == "dark" and main or dawn
			end
		end
		file:close()
		return colors
	end

	function M.ansi(colors)
		return {
			colors.overlay,
			colors.love,
			colors.foam,
			colors.gold,
			colors.pine,
			colors.iris,
			colors.rose,
			colors.text,
		}, {
			colors.subtle,
			colors.love,
			colors.foam,
			colors.gold,
			colors.pine,
			colors.iris,
			colors.rose,
			colors.text,
		}
	end

	return M
end
