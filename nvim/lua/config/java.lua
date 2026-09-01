-- Java runtime discovery driven by the machine, not the repo: every Homebrew
-- OpenJDK found under $HOMEBREW_PREFIX/opt/openjdk@* is offered to jdtls, and
-- the default comes from the machine profile (DOTDOTDOT_JAVA_VERSION or
-- JAVA_HOME) with a newest-installed fallback.
local M = {}

local function brew_prefix()
	return vim.env.HOMEBREW_PREFIX or "/opt/homebrew"
end

function M.home(version)
	return string.format("%s/opt/openjdk@%s/libexec/openjdk.jdk/Contents/Home", brew_prefix(), version)
end

-- Versions of all Homebrew OpenJDK runtimes present on this machine.
-- Major version of a JDK home, read from its release file (for unversioned kegs).
local function major_from_release(home)
	local release = home .. "/release"
	if vim.fn.filereadable(release) == 1 then
		for _, line in ipairs(vim.fn.readfile(release)) do
			local major = line:match('^JAVA_VERSION="(%d+)')
			if major then
				return major
			end
		end
	end
end

function M.installed_versions()
	local found = {}
	local candidates = vim.fn.glob(brew_prefix() .. "/opt/openjdk@*", false, true)
	vim.list_extend(candidates, vim.fn.glob(brew_prefix() .. "/opt/openjdk", false, true))
	for _, dir in ipairs(candidates) do
		local home = dir .. "/libexec/openjdk.jdk/Contents/Home"
		if vim.fn.isdirectory(home) == 1 then
			local version = dir:match("openjdk@(%d+)$") or major_from_release(home)
			if version and not vim.tbl_contains(found, version) then
				table.insert(found, version)
			end
		end
	end
	table.sort(found, function(a, b)
		return tonumber(a) < tonumber(b)
	end)
	return found
end

function M.default_version()
	local installed = M.installed_versions()

	local requested = vim.env.DOTDOTDOT_JAVA_VERSION
	if requested and not vim.tbl_contains(installed, requested) then
		requested = nil
	end
	if not requested and vim.env.JAVA_HOME then
		requested = vim.env.JAVA_HOME:match("openjdk@(%d+)")
		if requested and not vim.tbl_contains(installed, requested) then
			requested = nil
		end
	end

	return requested or installed[#installed] or "17"
end

function M.runtimes()
	local default = M.default_version()
	local runtimes = {}
	for _, version in ipairs(M.installed_versions()) do
		table.insert(runtimes, {
			name = "JavaSE-" .. version,
			path = M.home(version),
			default = version == default,
		})
	end
	return runtimes
end

return M
