local M = {}

local supported_versions = { "17", "21" }

function M.default_version()
	local requested = vim.env.DOTDOTDOT_JAVA_VERSION or "17"
	if vim.tbl_contains(supported_versions, requested) then
		return requested
	end
	return "17"
end

function M.home(version)
	local prefix = vim.env.HOMEBREW_PREFIX or "/opt/homebrew"
	return string.format("%s/opt/openjdk@%s/libexec/openjdk.jdk/Contents/Home", prefix, version)
end

function M.runtimes()
	local default = M.default_version()
	local runtimes = {}
	for _, version in ipairs(supported_versions) do
		local path = M.home(version)
		if vim.fn.isdirectory(path) == 1 then
			table.insert(runtimes, {
				name = "JavaSE-" .. version,
				path = path,
				default = version == default,
			})
		end
	end
	return runtimes
end

return M
