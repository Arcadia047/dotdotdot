local M = {}

local function find_root(bufnr, markers)
	return vim.fs.root(bufnr, markers)
end

local function executable(path, fallback)
	if path and vim.fn.executable(path) == 1 then
		return path
	end
	return fallback
end

local function contains(path, pattern)
	if not path or vim.fn.filereadable(path) ~= 1 then
		return false
	end
	local lines = vim.fn.readfile(path, "", 2000)
	return table.concat(lines, "\n"):find(pattern) ~= nil
end

local function shell_task(command)
	return { cmd = "/bin/zsh", args = { "-lc", command } }
end

local function package_task(root, file)
	local package_file = root .. "/package.json"
	if vim.fn.filereadable(package_file) ~= 1 then
		return nil
	end
	local ok, package = pcall(vim.json.decode, table.concat(vim.fn.readfile(package_file), "\n"))
	if not ok or type(package.scripts) ~= "table" then
		return nil
	end

	local script
	if file:match("[%.%-_]test%.[jt]sx?$") or file:match("[%.%-_]spec%.[jt]sx?$") then
		script = package.scripts.test and "test"
	end
	for _, candidate in ipairs({ "dev", "start" }) do
		if not script and package.scripts[candidate] then
			script = candidate
		end
	end
	if not script then
		return nil
	end

	local manager = "npm"
	if vim.fn.filereadable(root .. "/pnpm-lock.yaml") == 1 then
		manager = "pnpm"
	elseif vim.fn.filereadable(root .. "/yarn.lock") == 1 then
		manager = "yarn"
	elseif vim.fn.filereadable(root .. "/bun.lock") == 1 or vim.fn.filereadable(root .. "/bun.lockb") == 1 then
		manager = "bun"
	end
	return { name = manager .. " " .. script, cmd = manager, args = { "run", script }, cwd = root }
end

local function task_for_buffer(bufnr)
	local file = vim.api.nvim_buf_get_name(bufnr)
	local ft = vim.bo[bufnr].filetype
	local dir = vim.fs.dirname(file)
	local project = find_root(bufnr, {
		".git",
		"go.mod",
		"package.json",
		"pom.xml",
		"build.gradle",
		"build.gradle.kts",
		"build.sbt",
		"pyproject.toml",
	}) or dir

	if ft == "python" then
		local python = executable(project .. "/.venv/bin/python", "python3")
		return { name = "Run " .. vim.fs.basename(file), cmd = python, args = { file }, cwd = project }
	end

	if ft == "javascript" or ft == "typescript" then
		local root = find_root(bufnr, { "package.json" })
		local project_task = root and package_task(root, file)
		if project_task then
			return project_task
		end
	end

	if ft == "javascript" then
		return { name = "Run " .. vim.fs.basename(file), cmd = "node", args = { file }, cwd = project }
	end

	if ft == "typescript" then
		local tsx = project .. "/node_modules/.bin/tsx"
		if vim.fn.executable(tsx) == 1 then
			return { name = "Run " .. vim.fs.basename(file), cmd = tsx, args = { file }, cwd = project }
		end
		return {
			name = "Run " .. vim.fs.basename(file),
			cmd = "npx",
			args = { "--no-install", "tsx", file },
			cwd = project,
		}
	end

	if ft == "go" then
		local root = find_root(bufnr, { "go.work", "go.mod" }) or dir
		return { name = "Run Go package", cmd = "go", args = { "run", "." }, cwd = root }
	end

	if ft == "c" or ft == "cpp" then
		local build_root = find_root(bufnr, { "Makefile", "makefile", "CMakeLists.txt" })
		if
			build_root
			and (
				vim.fn.filereadable(build_root .. "/Makefile") == 1
				or vim.fn.filereadable(build_root .. "/makefile") == 1
			)
		then
			return { name = "Build project", cmd = "make", cwd = build_root }
		end
		if build_root and vim.fn.filereadable(build_root .. "/build/CMakeCache.txt") == 1 then
			return { name = "Build project", cmd = "cmake", args = { "--build", "build" }, cwd = build_root }
		end

		local compiler = ft == "c" and "cc" or "c++"
		local output = vim.fn.stdpath("cache") .. "/run-" .. vim.fn.sha256(file):sub(1, 16)
		local command = table.concat({
			vim.fn.shellescape(compiler),
			"-Wall -Wextra -g",
			vim.fn.shellescape(file),
			"-o",
			vim.fn.shellescape(output),
			"&&",
			vim.fn.shellescape(output),
		}, " ")
		local task = shell_task(command)
		task.name = "Build and run " .. vim.fs.basename(file)
		task.cwd = project
		return task
	end

	if ft == "java" then
		local java_root = find_root(bufnr, { "pom.xml", "mvnw", "build.gradle", "build.gradle.kts", "gradlew" })
		if java_root then
			local pom = java_root .. "/pom.xml"
			local class_name = vim.fs.basename(file):gsub("%.java$", "")
			local is_test = class_name:match("Test$") or class_name:match("Tests$")
			if is_test and vim.fn.filereadable(pom) == 1 then
				local mvn = executable(java_root .. "/mvnw", "mvn")
				return {
					name = "Test " .. class_name,
					cmd = mvn,
					args = { "-Dtest=" .. class_name, "test" },
					cwd = java_root,
				}
			end
			local gradle = vim.fn.filereadable(java_root .. "/build.gradle.kts") == 1
					and java_root .. "/build.gradle.kts"
				or java_root .. "/build.gradle"
			if is_test and vim.fn.filereadable(gradle) == 1 then
				local gradlew = executable(java_root .. "/gradlew", "gradle")
				return {
					name = "Test " .. class_name,
					cmd = gradlew,
					args = { "test", "--tests", class_name },
					cwd = java_root,
				}
			end
			if contains(pom, "spring%-boot") then
				local mvn = executable(java_root .. "/mvnw", "mvn")
				return { name = "Run Spring Boot", cmd = mvn, args = { "spring-boot:run" }, cwd = java_root }
			end
			if contains(gradle, "spring%-boot") or contains(gradle, "org%.springframework%.boot") then
				local gradlew = executable(java_root .. "/gradlew", "gradle")
				return { name = "Run Spring Boot", cmd = gradlew, args = { "bootRun" }, cwd = java_root }
			end
		end
		return { name = "Run " .. vim.fs.basename(file), cmd = "java", args = { file }, cwd = dir }
	end

	if ft == "scala" then
		if vim.fn.executable("scala-cli") == 1 then
			return { name = "Run " .. vim.fs.basename(file), cmd = "scala-cli", args = { "run", file }, cwd = project }
		end
		return { name = "Run " .. vim.fs.basename(file), cmd = "scala", args = { file }, cwd = project }
	end

	if ft == "sh" or ft == "bash" or ft == "zsh" then
		return {
			name = "Run " .. vim.fs.basename(file),
			cmd = ft == "zsh" and "zsh" or "bash",
			args = { file },
			cwd = dir,
		}
	end

	if ft == "lua" then
		return { name = "Run " .. vim.fs.basename(file), cmd = "lua", args = { file }, cwd = dir }
	end

	return nil
end

function M.run()
	local bufnr = vim.api.nvim_get_current_buf()
	if vim.bo[bufnr].filetype == "sql" then
		require("config.database").execute("statement")
		return
	end

	local file = vim.api.nvim_buf_get_name(bufnr)
	if file == "" then
		vim.notify("Save this buffer before running it", vim.log.levels.WARN)
		return
	end
	if vim.bo[bufnr].modified then
		vim.cmd("silent write")
	end

	local spec = task_for_buffer(bufnr)
	if not spec then
		vim.notify(
			"No current-file runner for " .. vim.bo[bufnr].filetype .. "; use <leader>rt for project tasks",
			vim.log.levels.INFO
		)
		return
	end

	local overseer = require("overseer")
	local task = overseer.new_task({
		name = spec.name,
		cmd = spec.cmd,
		args = spec.args,
		cwd = spec.cwd,
		components = {
			{ "on_output_quickfix", open_on_match = true, set_diagnostics = true },
			"default",
		},
	})
	if not task then
		vim.notify("Could not create run task", vim.log.levels.ERROR)
		return
	end
	task:start()
	overseer.open({ direction = "bottom", enter = false })
end

return M
