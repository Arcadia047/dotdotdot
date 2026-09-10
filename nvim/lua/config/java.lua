-- One resolver for Neovim and bootstrap (scripts/java-runtime.lua).
-- Keep actual JDK homes: an unversioned Homebrew keg is not openjdk@<major>.
local M = {}

local function present(value)
	return value and value ~= "" and value or nil
end

local function runtime_at(home)
	if not home or vim.fn.executable(home .. "/bin/java") ~= 1 then
		return nil
	end
	local ok, lines = pcall(vim.fn.readfile, home .. "/release")
	if ok then
		for _, line in ipairs(lines) do
			local version = line:match('^JAVA_VERSION="(%d+)')
			if version then
				return { version = version, path = home }
			end
		end
	end
end

function M.discover()
	local prefix = present(vim.env.HOMEBREW_PREFIX) or "/opt/homebrew"
	local found = {}
	local function add(home)
		local runtime = runtime_at(home)
		if runtime then
			found[runtime.version] = runtime
		end
	end
	add(prefix .. "/opt/openjdk/libexec/openjdk.jdk/Contents/Home")
	for _, dir in ipairs(vim.fn.glob(prefix .. "/opt/openjdk@*", false, true)) do
		add(dir .. "/libexec/openjdk.jdk/Contents/Home")
	end
	-- A custom JAVA_HOME wins over a Homebrew runtime of the same version.
	if present(vim.env.JAVA_HOME) then
		assert(runtime_at(vim.env.JAVA_HOME), "JAVA_HOME must name an executable JDK with a readable release file")
		add(vim.env.JAVA_HOME)
	end
	local runtimes = vim.tbl_values(found)
	table.sort(runtimes, function(a, b)
		return tonumber(a.version) < tonumber(b.version)
	end)
	return runtimes
end

local function requested_runtime(runtimes, version, label)
	assert(version:match("^%d+$"), label .. " must be a Java major version")
	for _, runtime in ipairs(runtimes) do
		if runtime.version == version then
			return runtime
		end
	end
	error(label .. " requests Java " .. version .. ", but that JDK is not installed")
end

function M.project(runtimes)
	runtimes = runtimes or M.discover()
	local requested = present(vim.env.DOTDOTDOT_JAVA_VERSION)
	if requested then
		return requested_runtime(runtimes, requested, "DOTDOTDOT_JAVA_VERSION")
	end
	if present(vim.env.JAVA_HOME) then
		return assert(runtime_at(vim.env.JAVA_HOME))
	end
	return assert(runtimes[#runtimes], "No usable JDK found; install a JDK or set JAVA_HOME")
end

function M.launcher(runtimes)
	runtimes = runtimes or M.discover()
	local requested = present(vim.env.DOTDOTDOT_JDTLS_JAVA_VERSION)
	local runtime = requested and requested_runtime(runtimes, requested, "DOTDOTDOT_JDTLS_JAVA_VERSION")
		or runtimes[#runtimes]
	assert(runtime and tonumber(runtime.version) >= 21, "jdtls requires an installed Java 21+ runtime")
	return runtime
end

function M.runtimes()
	local installed = M.discover()
	local default = M.project(installed)
	local runtimes = {}
	for _, runtime in ipairs(installed) do
		table.insert(runtimes, {
			name = "JavaSE-" .. runtime.version,
			path = runtime.path,
			default = runtime.version == default.version,
		})
	end
	return runtimes
end

return M
