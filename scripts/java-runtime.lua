-- Runs without loading Neovim plugins. Bootstrap supplies the machine profile.
local root = vim.fs.dirname(vim.fs.dirname(debug.getinfo(1, "S").source:sub(2)))
local java = dofile(root .. "/nvim/lua/config/java.lua")
local ok, err = pcall(function()
	if arg[1] == "project" then
		io.write(java.project().path .. "\n")
	elseif arg[1] == "check" then
		local runtimes = java.discover()
		local project, launcher = java.project(runtimes), java.launcher(runtimes)
		io.write("Project Java " .. project.version .. " (" .. project.path .. ")\n")
		io.write("jdtls Java " .. launcher.version .. " (" .. launcher.path .. ")\n")
	else
		error("usage: java-runtime.lua project|check")
	end
end)
if not ok then
	io.stderr:write(tostring(err) .. "\n")
	vim.cmd("cquit")
end
