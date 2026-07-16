local M = {}

local function available()
	if vim.fn.exists(":DB") == 2 then
		return true
	end
	vim.notify("Dadbod is not available yet", vim.log.levels.ERROR)
	return false
end

function M.execute(scope)
	if not available() then
		return
	end
	if vim.bo.modified then
		vim.cmd("silent write")
	end

	if scope == "buffer" then
		vim.cmd("%DB")
	elseif scope == "selection" then
		vim.cmd("'<,'>DB")
	else
		-- A blank-line-delimited paragraph is a predictable SQL statement unit.
		vim.cmd("normal! vip")
		vim.cmd("'<,'>DB")
	end
end

return M
