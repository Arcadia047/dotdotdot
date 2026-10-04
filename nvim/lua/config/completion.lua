local M = {}

function M.allow(provider)
	return function(ctx)
		return ctx.trigger.initial_kind == "manual" or vim.tbl_contains(M.sources(ctx), provider)
	end
end

function M.sources(ctx)
	local before = ctx.line:sub(1, ctx.bounds.start_col - 1)
	local ok, node = pcall(vim.treesitter.get_node)
	while ok and node do
		local kind = node:type()
		if kind:find("comment") then
			return { "buffer" }
		elseif kind:find("string") or kind:find("attribute_value") then
			return { "path", "buffer" }
		end
		node = node:parent()
	end
	if before:match("%.%s*$") or before:match("%->%s*$") or before:match("::%s*$") then
		return vim.bo.filetype == "sql" and { "dadbod", "lsp" } or { "lsp" }
	end
	if vim.bo.filetype == "html" and before:match("<[/]?%s*$") then
		return { "lsp" }
	end
	return { "buffer" }
end

function M.project_buffers()
	local ft = vim.bo.filetype
	local web = { javascript = true, javascriptreact = true, typescript = true, typescriptreact = true }
	return vim.tbl_filter(function(buf)
		local other = vim.bo[buf].filetype
		return other == ft or (web[ft] and web[other])
	end, require("config.project").buffers(0))
end

function M.show(cmp)
	-- Explicit providers also replace an already-open automatic menu.
	local providers = vim.bo.filetype == "sql" and { "dadbod", "lsp", "path" } or { "lsp", "path" }
	return cmp.show({ providers = providers })
end

return M
