"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const buckets = ["attention", "active", "waiting", "ready", "archived"];
  const bucketLabels = { attention: "Needs you", active: "Active", waiting: "Waiting", ready: "Ready", archived: "History" };
  const statusLabels = { queued: "Queued", running: "Running", checking: "Checking", reviewing: "Reviewing", integrating: "Integrating", ready: "Ready", blocked: "Blocked", paused: "Paused", interrupted: "Interrupted" };
  const emptyCopy = {
    attention: "No jobs need your input.",
    active: "No jobs are running.",
    waiting: "No jobs are waiting on prerequisites or dispatch.",
    ready: "No checked and reviewed candidates yet.",
    archived: "No archived work yet.",
  };
  const state = {
    snapshot: null, signature: "", view: "overview", filter: "all", query: "",
    selected: null, connected: false, lastSuccess: 0, pending: false,
    refreshing: null, timer: null, message: "", error: "", authFailed: false,
  };
  let opener = null;
  let token = "";
  try {
    const fragment = new URLSearchParams(location.hash.slice(1));
    token = fragment.get("token") || sessionStorage.getItem("omp-work-capability") || "";
    if (fragment.has("token")) {
      sessionStorage.setItem("omp-work-capability", token);
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch {
    token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* URL remains usable without storage. */ }
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function button(label, className, handler, key) {
    const node = element("button", className, label);
    node.type = "button";
    if (key) node.dataset.focusKey = key;
    node.addEventListener("click", handler);
    return node;
  }

  function announce(message) { $("announcements").textContent = message; }
  function shortSha(value) { return value ? value.slice(0, 8) : "No candidate"; }
  function plural(count, noun = "job") { return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`; }
  function unresolvedDependencies(job) {
    return job.dependsOn.filter((id) => state.snapshot?.jobs.find((item) => item.id === id)?.status !== "ready");
  }
  function recoveryNeeded() {
    return Boolean(state.snapshot?.jobs.some((job) => job.bucket === "attention" && job.phase === "recovery"));
  }
  function shouldResumeDispatch() {
    const snapshot = state.snapshot;
    return Boolean(snapshot && (snapshot.paused || recoveryNeeded() || (!snapshot.controllerActive && (snapshot.counts.waiting || snapshot.counts.attention))));
  }
  function phaseLabel(job) {
    if (job.bucket === "archived") return "Archived";
    if (job.phase === "recovery") return "Needs recovery";
    if (job.bucket === "waiting") return unresolvedDependencies(job).length ? "Prerequisite waiting" : state.snapshot?.paused ? "Dispatch paused" : state.snapshot?.controllerActive ? "Worker capacity" : "Dispatch idle";
    const labels = {
      queued: "Queued", running: job.kind === "integration" ? "Integration work" : "Implementation",
      checking: "Checks & reviews", reviewing: "Independent reviews", integrating: "Integration",
      ready: "Checked & reviewed", blocked: "Blocked", paused: "Paused", interrupted: "Interrupted",
    };
    return Object.hasOwn(labels, job.phase) ? labels[job.phase] : job.phase || statusLabels[job.status];
  }
  function timestamp(value, full = false) {
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return "Unknown time";
    return full ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  function validateSnapshot(data) {
    const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
    const optionalString = (value) => value === undefined || typeof value === "string";
    const dateString = (value) => typeof value === "string" && Number.isFinite(new Date(value).valueOf());
    if (!isObject(data) || data.version !== 1 || !dateString(data.generatedAt) || typeof data.profile !== "string" || typeof data.paused !== "boolean" || typeof data.controllerActive !== "boolean" || !optionalString(data.actionError) || !Array.isArray(data.jobs) || !isObject(data.counts)) throw new Error("The manager returned an unsupported status response.");
    const ids = new Set();
    const totals = Object.fromEntries(buckets.map((bucket) => [bucket, 0]));
    for (const job of data.jobs) {
      if (!isObject(job) || !["id", "title", "task", "repo", "repoName", "branch", "worktree", "phase"].every((key) => typeof job[key] === "string") || !job.id || ids.has(job.id) || !Object.hasOwn(statusLabels, job.status) || !buckets.includes(job.bucket) || !Number.isInteger(job.attempt) || job.attempt < 0 || !["implementation", "integration"].includes(job.kind) || !strings(job.dependsOn) || !dateString(job.updatedAt) || (job.archivedAt !== undefined && !dateString(job.archivedAt)) || ![job.candidate, job.integrationTarget, job.blocker].every(optionalString) || typeof job.canResume !== "boolean") throw new Error("The manager returned an incomplete job record.");
      if (job.attention !== undefined && (!isObject(job.attention) || typeof job.attention.reason !== "string" || typeof job.attention.nextAction !== "string")) throw new Error("The manager returned an incomplete attention record.");
      for (const evidence of [job.evidence, ...(job.integrationEvidence === undefined ? [] : [job.integrationEvidence])]) {
        if (!isObject(evidence) || typeof evidence.available !== "boolean" || typeof evidence.current !== "boolean" || ![evidence.revision, evidence.branch, evidence.receiptFile].every(optionalString) || !Array.isArray(evidence.checks) || !Array.isArray(evidence.reviews)) throw new Error("The manager returned an incomplete evidence record.");
        if (!evidence.checks.every((check) => isObject(check) && typeof check.name === "string" && typeof check.status === "string" && (check.exitCode === null || Number.isInteger(check.exitCode))) || !evidence.reviews.every((review) => isObject(review) && ["spec", "standards"].includes(review.axis) && typeof review.status === "string" && optionalString(review.verdict))) throw new Error("The manager returned invalid validation evidence.");
      }
      const evidence = job.evidence;
      if (evidence.current && (!evidence.available || job.bucket !== "ready" || job.status !== "ready" || job.archivedAt || !job.candidate || evidence.revision !== job.candidate || (evidence.branch !== undefined && evidence.branch !== job.branch))) throw new Error("The manager returned validation evidence that does not match a current ready candidate.");
      if (job.integrationEvidence?.current) throw new Error("The manager returned a recorded integration attempt as current validation.");
      ids.add(job.id);
      totals[job.bucket] += 1;
    }
    if (!buckets.every((bucket) => data.counts[bucket] === totals[bucket]) || data.counts.total !== data.jobs.length) throw new Error("The manager returned counts that do not match its queue.");
    return data;
  }

  function canControl() {
    return Boolean(token && state.snapshot && state.connected && !state.authFailed && !state.pending && !document.hidden && Date.now() - state.lastSuccess < 12000);
  }

  function controlDisabledReason() {
    if (state.pending) return "Waiting for the manager to accept the action";
    if (!token || state.authFailed) return "Open a fresh dashboard URL from OMP";
    return "Reconnect to the manager before changing work";
  }

  function updateControlButtons() {
    const available = canControl();
    const toggle = $("dispatchToggle");
    const resume = shouldResumeDispatch();
    toggle.textContent = state.pending ? "Working…" : resume ? "Resume all work" : "Pause dispatch";
    toggle.disabled = !available;
    toggle.title = available ? resume ? "Resume dispatch and reconcile retained jobs through the existing recovery guards" : "Pause new dispatch; running work continues" : controlDisabledReason();
    document.querySelectorAll("[data-resume-job]").forEach((node) => {
      const startsDispatch = state.snapshot?.paused || !state.snapshot?.controllerActive;
      node.textContent = startsDispatch ? "Resume job & dispatch" : "Resume job";
      node.disabled = !available;
      node.title = available ? startsDispatch ? "Resume this job through the recovery guards and resume dispatch for eligible work" : "Ask the manager to resume this job through its recovery guards" : controlDisabledReason();
    });
  }

  function notice(id, message, tone, retry = false) {
    const node = $(id);
    node.hidden = !message;
    node.className = `notice${tone ? ` notice-${tone}` : ""}`;
    node.replaceChildren();
    if (!message) return;
    node.append(element("p", "", message));
    if (retry) node.append(button("Retry", "text-button", () => refresh(), "retry"));
  }

  function renderConnection() {
    const snapshot = state.snapshot;
    $("dispatchState").textContent = snapshot ? snapshot.paused ? "Dispatch paused" : recoveryNeeded() ? "Recovery needed" : snapshot.controllerActive ? "Dispatch running" : "Dispatch idle" : "Not connected";
    $("freshness").textContent = snapshot ? `${state.connected ? "Updated" : "Last updated"} ${timestamp(snapshot.generatedAt)}` : "Waiting for first update";
    $("freshness").title = snapshot ? timestamp(snapshot.generatedAt, true) : "";
    if (!token || state.authFailed) notice("connectionNotice", "This dashboard link is missing or no longer authorized. Run /work dashboard in OMP and open the fresh URL.", "error");
    else if (!state.connected && state.error) notice("connectionNotice", snapshot ? `Connection lost. Showing the snapshot from ${timestamp(snapshot.generatedAt, true)}. Controls are unavailable. ${state.error}` : `Could not read the local queue. ${state.error}`, "error", true);
    else if (snapshot?.paused) notice("connectionNotice", "Dispatch is paused. Running work may finish. Resume all work also reconciles blocked and interrupted jobs.", "neutral");
    else if (!state.connected && snapshot) notice("connectionNotice", `Reconnecting. Showing the snapshot from ${timestamp(snapshot.generatedAt, true)}; controls are unavailable.`, "");
    else if (recoveryNeeded()) notice("connectionNotice", "The previous manager stopped. Retained work needs recovery. Resume all work reconciles it through the existing guards.", "neutral");
    else if (snapshot && !snapshot.controllerActive && shouldResumeDispatch()) notice("connectionNotice", "Dispatch is idle. Resume all work starts eligible jobs and reconciles retained work.", "neutral");
    else notice("connectionNotice", "", "");
    if ($("detailConnectionNotice")) {
      const source = $("connectionNotice");
      notice("detailConnectionNotice", source.hidden ? "" : source.firstElementChild.textContent, source.classList.contains("notice-error") ? "error" : "neutral");
    }
    notice("commandNotice", state.message, state.message.startsWith("Action failed") ? "error" : "neutral");
    if ($("detailCommandNotice")) notice("detailCommandNotice", state.message, state.message.startsWith("Action failed") ? "error" : "neutral");
    notice("managerNotice", snapshot?.actionError ? `Manager action: ${snapshot.actionError}` : "", "error");
    if ($("detailManagerNotice")) notice("detailManagerNotice", snapshot?.actionError ? `Manager action: ${snapshot.actionError}` : "", "error");
    updateControlButtons();
  }

  function restoreFocus(key) {
    if (!key) return;
    const node = [...document.querySelectorAll("[data-focus-key]")].find((item) => item.dataset.focusKey === key);
    if (node && !node.disabled) node.focus({ preventScroll: true });
    else if ($("jobDialog").open) $("detailClose").focus({ preventScroll: true });
  }

  function preservingFocus(render) {
    const key = document.activeElement?.dataset.focusKey;
    render();
    restoreFocus(key);
  }

  function filteredJobs() {
    if (!state.snapshot) return [];
    const query = state.query.trim().toLocaleLowerCase();
    return state.snapshot.jobs.filter((job) => {
      if (state.view === "history" && job.bucket !== "archived") return false;
      if (state.filter !== "all" && job.bucket !== state.filter) return false;
      return !query || [job.title, job.id, job.repoName, job.repo, job.branch, job.candidate || "", job.phase, phaseLabel(job), job.status].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }

  function statusPill(job) {
    return element("span", `status${["attention", "active", "ready"].includes(job.bucket) ? ` status-${job.bucket}` : ""}`, job.phase === "recovery" ? "Needs recovery" : statusLabels[job.status]);
  }

  function jobTitle(job, prefix) {
    const node = button(job.title || job.id, "job-title", (event) => openJob(job.id, event.currentTarget), `${prefix}:${job.id}`);
    node.setAttribute("aria-haspopup", "dialog");
    return node;
  }

  function jobContext(job, includeBranch = false) {
    const line = element("div", "job-context");
    line.append(element("span", "", job.repoName));
    if (includeBranch) line.append(element("span", "", "·"), element("code", "", job.branch));
    line.append(element("span", "", "·"), element("code", "", job.id));
    return line;
  }

  function resumeButton(job, prefix, primary = false) {
    const node = button("Resume job", `button${primary ? " button-primary" : ""}`, () => control("resume", job.id), `${prefix}:${job.id}`);
    node.dataset.resumeJob = job.id;
    node.disabled = !canControl();
    return node;
  }

  function attentionRow(job) {
    const row = element("article", "attention-row");
    const body = element("div", "attention-body");
    const titleLine = element("div", "attention-title-line");
    titleLine.append(jobTitle(job, "attention-title"), statusPill(job));
    body.append(titleLine, jobContext(job, true));
    body.append(element("p", "reason", job.attention?.reason || job.blocker || "Open the job for its recovery context."));
    if (job.attention?.nextAction) {
      const next = element("p", "next-action");
      next.append(element("strong", "", "Next: "), document.createTextNode(job.attention.nextAction));
      body.append(next);
    }
    const action = element("div", "attention-action");
    action.append(job.canResume ? resumeButton(job, "attention-resume") : button("View details →", "text-button", (event) => openJob(job.id, event.currentTarget), `attention-details:${job.id}`));
    row.append(body, action);
    return row;
  }

  function workRow(job) {
    const row = element("article", "work-row");
    row.append(jobTitle(job, "work-title"), jobContext(job));
    const line = element("div", "branch-stage");
    const branch = element("code", "branch", job.branch);
    branch.title = job.branch;
    const stage = element("span", "stage", phaseLabel(job));
    stage.title = `${statusLabels[job.status]} · ${phaseLabel(job)}`;
    line.append(branch, element("span", "stage-arrow", "→"), stage);
    row.append(line);
    if (job.bucket === "waiting") {
      const names = unresolvedDependencies(job).map((id) => state.snapshot.jobs.find((item) => item.id === id)?.title || id);
      row.append(element("p", "waiting-note", names.length ? `Waiting on: ${names.join(", ")}` : state.snapshot.paused ? "Waiting for dispatch to resume." : state.snapshot.controllerActive ? "Waiting for an eligible worker slot." : "Resume all work to dispatch this job."));
    } else if (job.candidate) {
      const candidate = element("div", "job-context");
      candidate.append(element("code", "candidate", shortSha(job.candidate)), element("span", "", "·"), element("span", "", job.bucket === "archived" ? `Archived ${timestamp(job.archivedAt || job.updatedAt, true)}` : `Updated ${timestamp(job.updatedAt)}`));
      row.append(candidate);
    }
    return row;
  }

  function selectQueue(bucket) {
    state.view = "all";
    state.filter = bucket;
    $("bucketFilter").value = bucket;
    render();
    announce(`Showing ${bucketLabels[bucket].toLocaleLowerCase()} work.`);
  }

  function render() {
    const snapshot = state.snapshot;
    if (!snapshot) {
      renderConnection();
      if (state.error || !token || state.authFailed) {
        $("workContent").setAttribute("aria-busy", "false");
        const empty = element("section", "no-results");
        empty.append(element("h2", "", "Queue unavailable"), element("p", "", "Reconnect from your managing OMP session to read this queue."));
        $("workContent").replaceChildren(empty);
        $("finding").textContent = "Waiting for a connection to your OMP session.";
      }
      return;
    }
    preservingFocus(() => {
      $("profile").textContent = snapshot.profile;
      $("profile").title = snapshot.profile;
      $("pageTitle").textContent = state.view === "history" ? "Work history" : state.view === "all" ? "All work" : "Work overview";
      for (const node of document.querySelectorAll("[data-view]")) {
        if (node.dataset.view === state.view) node.setAttribute("aria-current", "page");
        else node.removeAttribute("aria-current");
      }
      const all = filteredJobs();
      const hasFilter = state.query.trim() || state.filter !== "all" || state.view === "history";
      $("finding").textContent = hasFilter ? `${plural(all.length)} in this view · ${plural(snapshot.counts.total)} in the local queue.` : snapshot.counts.attention ? `${plural(snapshot.counts.attention)} need${snapshot.counts.attention === 1 ? "s" : ""} your input.${snapshot.counts.waiting ? ` ${plural(snapshot.counts.waiting)} waiting.` : ""}` : `Nothing needs your input.${snapshot.paused ? " Dispatch is paused." : snapshot.controllerActive ? ` ${plural(snapshot.counts.active)} active.` : " Dispatch is idle."}`;
      const content = $("workContent");
      content.replaceChildren();
      content.setAttribute("aria-busy", "false");
      const attentionJobs = all.filter((job) => job.bucket === "attention");
      if (state.view !== "history" && (state.filter === "all" || state.filter === "attention")) {
        const section = element("section", "attention-section");
        const heading = element("div", "section-heading");
        const title = element("div", "section-title");
        title.append(element("h2", "", "Needs you"), element("span", "count", attentionJobs.length));
        heading.append(title, element("p", "section-note", "Root blockers and next actions"));
        const list = element("div", "attention-list");
        const capped = state.view === "overview" && !hasFilter;
        const shown = capped ? attentionJobs.slice(0, 3) : attentionJobs;
        if (shown.length) shown.forEach((job) => list.append(attentionRow(job)));
        else list.append(element("p", "empty", hasFilter ? "No jobs needing input match this view." : emptyCopy.attention));
        section.append(heading, list);
        if (shown.length < attentionJobs.length) section.append(button(`View all ${attentionJobs.length} needing input →`, "text-button view-more", () => selectQueue("attention"), "all-attention"));
        content.append(section);
      }
      const visibleBuckets = buckets.filter((bucket) => bucket !== "attention" && (state.filter === "all" || bucket === state.filter) && (state.view !== "history" || bucket === "archived"));
      if (visibleBuckets.length) {
        const heading = element("div", "queue-heading");
        heading.append(element("h2", "", state.view === "history" ? "Archived work" : "Work lanes"), element("p", "", "Branch → current stage"));
        content.append(heading);
        const lanes = element("div", "lane-grid");
        for (const bucket of visibleBuckets) {
          const jobs = all.filter((job) => job.bucket === bucket);
          const section = element("section", "lane");
          const header = element("div", "lane-header");
          const name = element("div", "lane-name");
          name.append(element("h3", "", bucketLabels[bucket]), element("span", "count", jobs.length));
          header.append(name);
          const cap = state.view === "overview" && !hasFilter ? 2 : jobs.length;
          if (jobs.length > cap) header.append(button(`View all ${jobs.length} →`, "text-button", () => selectQueue(bucket), `all-${bucket}`));
          section.append(header);
          if (jobs.length) jobs.slice(0, cap).forEach((job) => section.append(workRow(job)));
          else section.append(element("p", "empty", hasFilter ? `No ${bucket === "archived" ? "archived" : bucket} work matches this view.` : emptyCopy[bucket]));
          lanes.append(section);
        }
        content.append(lanes);
      }
      if (state.query.trim() && all.length === 0) {
        const noResults = element("div", "no-results");
        noResults.append(element("h2", "", "No matching work"), button("Clear search", "text-button", () => { state.query = ""; $("search").value = ""; render(); $("search").focus(); }, "clear-search"));
        content.append(noResults);
      }
      if ($("jobDialog").open) renderDetail();
    });
    renderConnection();
  }

  function fact(list, label, value, mono = false) {
    list.append(element("dt", "", label));
    const data = element("dd", "");
    data.append(element(mono ? "code" : "span", "", value || "—"));
    list.append(data);
  }

  function disclosure(label, value, key) {
    const node = element("details", "");
    node.dataset.disclosure = key;
    const summary = element("summary", "", label);
    summary.dataset.focusKey = `disclosure:${key}`;
    node.append(summary, element("p", "", value));
    return node;
  }

  function evidenceRow(label, value) {
    const row = element("li", "");
    const failed = /fail|error|reject|blocked|not[_ -]?ready/i.test(value);
    const success = /^(pass|passed|ready|success|succeeded|approved|ok)\b/i.test(value);
    row.append(element("span", "", label), element("span", `evidence-value${failed ? " failure" : success ? " success" : ""}`, value));
    return row;
  }

  function localPath(label, value, key) {
    const path = element("div", "local-path");
    const heading = element("div", "path-heading");
    heading.append(element("span", "", label));
    if (value) heading.append(button("Copy", "text-button", async (event) => {
      const control = event.currentTarget;
      try {
        await navigator.clipboard.writeText(value);
        control.textContent = "Copied";
        announce(`${label} copied.`);
      } catch {
        control.textContent = "Select path below";
        const range = document.createRange();
        range.selectNodeContents(path.lastElementChild);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        announce("Clipboard unavailable. The path is selected for copying.");
      }
    }, key));
    path.append(heading, element("code", "", value || "Unavailable"));
    return path;
  }

  function validationSection(evidence, integration = false) {
    const scope = integration ? "integration" : "branch";
    const section = element("section", "detail-section");
    section.append(element("h3", "", integration ? "Integration validation" : "Branch validation"));
    if (!evidence?.available) {
      section.append(element("p", "evidence-caption", `No ${scope} validation evidence is available${integration ? " yet" : " for this job"}.`));
      return section;
    }
    section.append(element("p", "evidence-caption", integration ? "Last recorded integration attempt · Historical evidence; this does not certify the current integration branch." : evidence.current ? "Current branch validation for this ready candidate." : "Last branch validation attempt · Historical evidence; this does not certify the current job."));
    for (const [label, value] of [["Evidence branch", evidence.branch], ["Evidence revision", evidence.revision]]) {
      const context = element("p", "evidence-caption");
      context.append(document.createTextNode(`${label} `), element("code", "", value || "Unavailable"));
      section.append(context);
    }
    const checksGroup = element("div", "evidence-group");
    checksGroup.append(element("h4", "", "Checks"));
    const checks = element("ul", "evidence-list");
    evidence.checks.forEach((check) => checks.append(evidenceRow(check.name, `${check.status}${check.exitCode === null ? "" : ` · exit ${check.exitCode}`}`)));
    if (!evidence.checks.length) checksGroup.append(element("p", "evidence-caption", "No check results in this evidence."));
    else checksGroup.append(checks);
    section.append(checksGroup);
    const reviewsGroup = element("div", "evidence-group");
    reviewsGroup.append(element("h4", "", "Independent reviews"));
    const reviews = element("ul", "evidence-list");
    for (const axis of ["spec", "standards"]) {
      const review = evidence.reviews.find((item) => item.axis === axis);
      reviews.append(evidenceRow(axis === "spec" ? "Spec" : "Standards", review ? `${review.status}${review.verdict ? ` · ${review.verdict}` : ""}` : "Not recorded"));
    }
    reviewsGroup.append(reviews);
    section.append(reviewsGroup);
    return section;
  }

  function renderDetail() {
    const root = $("detailContent");
    const opened = new Set([...root.querySelectorAll("details[open]")].map((node) => node.dataset.disclosure));
    const oldScroll = $("jobDialog").scrollTop;
    root.replaceChildren();
    const job = state.snapshot.jobs.find((item) => item.id === state.selected);
    if (!job) {
      const title = element("h2", "", "Job no longer available");
      title.id = "detailTitle";
      root.append(title, element("p", "detail-subtitle", "This job is no longer present in the manager’s queue."));
      return;
    }
    const title = element("h2", "", job.title || job.id);
    title.id = "detailTitle";
    root.append(title, element("p", "detail-subtitle", `${job.repoName} · ${job.id}`));
    const status = element("div", "detail-state");
    status.append(statusPill(job), element("span", "muted", `${phaseLabel(job)} · Attempt ${job.attempt}`));
    root.append(status);
    const connectionNotice = element("div", "notice notice-neutral");
    connectionNotice.id = "detailConnectionNotice";
    connectionNotice.setAttribute("role", "status");
    connectionNotice.hidden = true;
    root.append(connectionNotice);
    const commandNotice = element("div", "notice notice-neutral");
    commandNotice.id = "detailCommandNotice";
    commandNotice.setAttribute("role", "status");
    commandNotice.hidden = true;
    root.append(commandNotice);
    const managerNotice = element("div", "notice notice-error");
    managerNotice.id = "detailManagerNotice";
    managerNotice.setAttribute("role", "status");
    managerNotice.hidden = true;
    root.append(managerNotice);
    if (job.bucket === "attention") {
      const attention = element("section", "detail-attention");
      attention.append(element("h3", "", "Needs your input"), element("p", "", job.attention?.reason || job.blocker || "Read the original blocker for recovery context."));
      if (job.attention?.nextAction) attention.append(element("p", "next-action", `Next: ${job.attention.nextAction}`));
      if (job.canResume) attention.append(resumeButton(job, "detail-resume", true));
      root.append(attention);
    }
    const branchSection = element("section", "detail-section");
    branchSection.append(element("h3", "", "Branch & candidate"));
    const facts = element("dl", "facts");
    fact(facts, "Branch", job.branch, true);
    fact(facts, "Candidate", job.candidate || "No candidate yet", Boolean(job.candidate));
    fact(facts, "Kind", job.kind === "integration" ? "Integration" : "Implementation");
    if (job.phase === "recovery") fact(facts, "Recorded stage", statusLabels[job.status]);
    if (job.integrationTarget) fact(facts, "Integrates", job.integrationTarget, true);
    fact(facts, "Updated", timestamp(job.updatedAt, true));
    if (job.archivedAt) fact(facts, "Archived", timestamp(job.archivedAt, true));
    branchSection.append(facts);
    root.append(branchSection);

    const evidence = job.evidence;
    root.append(validationSection(evidence));
    const integrationTarget = state.snapshot.jobs.find((item) => item.id === job.integrationTarget);
    if (job.integrationTarget || job.integrationEvidence) {
      const integration = validationSection(job.integrationEvidence, true);
      if (integrationTarget) integration.append(button(`View integration job · ${integrationTarget.id}`, "text-button", () => openJob(integrationTarget.id), `integration:${integrationTarget.id}`));
      root.append(integration);
    }
    if (job.dependsOn.length) {
      const dependencies = element("section", "detail-section");
      dependencies.append(element("h3", "", "Prerequisites"));
      const items = element("div", "dependencies");
      job.dependsOn.forEach((id) => {
        const dependency = state.snapshot.jobs.find((item) => item.id === id);
        if (dependency) items.append(button(`${id} · ${statusLabels[dependency.status]}`, "button", () => openJob(id), `dependency:${id}`));
        else items.append(element("span", "muted", `${id} · Unavailable`));
      });
      dependencies.append(items);
      root.append(dependencies);
    }
    if (job.blocker) root.append(disclosure("Original blocker", job.blocker, "blocker"));
    root.append(disclosure("Accepted task", job.task, "task"));
    const paths = element("details", "");
    paths.dataset.disclosure = "paths";
    const pathsSummary = element("summary", "", "Workspace & evidence paths");
    pathsSummary.dataset.focusKey = "disclosure:paths";
    paths.append(pathsSummary, localPath("Repository", job.repo, "copy-repository"), localPath(job.archivedAt ? "Former branch workspace · archived" : "Branch workspace", job.worktree, "copy-workspace"), localPath("Branch validation receipt", evidence.receiptFile, "copy-receipt"));
    if (job.integrationTarget || job.integrationEvidence) {
      paths.append(localPath(integrationTarget?.archivedAt ? "Former integration workspace · archived" : "Integration workspace", integrationTarget?.worktree, "copy-integration-workspace"), localPath("Integration validation receipt", job.integrationEvidence?.receiptFile, "copy-integration-receipt"));
    }
    root.append(paths);
    root.querySelectorAll("details").forEach((node) => { node.open = opened.has(node.dataset.disclosure); });
    $("jobDialog").scrollTop = oldScroll;
  }

  function openJob(id, source) {
    const dialog = $("jobDialog");
    const changed = state.selected !== id;
    state.selected = id;
    if (source) opener = { node: source, key: source.dataset.focusKey, id };
    if (changed) $("detailContent").replaceChildren();
    renderDetail();
    if (!dialog.open) dialog.showModal();
    if (changed) { dialog.scrollTop = 0; $("detailClose").focus({ preventScroll: true }); }
    renderConnection();
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(path, {
        ...options, cache: "no-store", credentials: "omit", redirect: "error",
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
        signal: controller.signal,
      });
      let data;
      try { data = await response.json(); } catch {
        state.connected = false;
        throw new Error("The manager returned an unreadable response.");
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) { state.authFailed = true; state.connected = false; }
        throw new Error(typeof data?.error === "string" ? data.error : `The manager rejected the request (${response.status}).`);
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        state.connected = false;
        state.error = "The manager did not respond in time.";
        throw new Error(state.error);
      }
      if (error instanceof TypeError) {
        state.connected = false;
        state.error = "Check that the managing OMP session is still open.";
        throw new Error(state.error);
      }
      throw error;
    } finally { clearTimeout(timeout); }
  }

  function schedule() {
    clearTimeout(state.timer);
    if (!document.hidden && !state.authFailed && token) state.timer = setTimeout(() => refresh(), 4000);
  }

  async function refresh() {
    if (state.refreshing) return state.refreshing;
    if (!token || state.authFailed || document.hidden) { render(); return; }
    clearTimeout(state.timer);
    $("refresh").disabled = true;
    state.refreshing = (async () => {
      try {
        const snapshot = validateSnapshot(await api("/api/status"));
        const signature = JSON.stringify({ ...snapshot, generatedAt: "" });
        const changed = signature !== state.signature;
        const oldAttention = state.snapshot?.counts.attention;
        const reconnected = !state.connected && Boolean(state.snapshot);
        state.snapshot = snapshot;
        state.signature = signature;
        state.connected = true;
        state.lastSuccess = Date.now();
        state.error = "";
        if (changed) render();
        else renderConnection();
        if (reconnected) announce("Reconnected to the local manager.");
        else if (oldAttention !== undefined && oldAttention !== snapshot.counts.attention) announce(`${plural(snapshot.counts.attention)} need your input.`);
      } catch (error) {
        state.connected = false;
        state.error = error.message || "The local manager is unavailable.";
        render();
      } finally {
        state.refreshing = null;
        $("refresh").disabled = false;
        schedule();
      }
    })();
    return state.refreshing;
  }

  async function control(action, id) {
    if (!canControl()) return;
    state.pending = true;
    state.message = id ? "Requesting job recovery…" : action === "pause" ? "Requesting a dispatch pause…" : "Requesting dispatch and recovery to resume…";
    renderConnection();
    try {
      const result = await api("/api/control", { method: "POST", body: JSON.stringify(id ? { action, id } : { action }) });
      if (result?.accepted !== true) {
        state.connected = false;
        state.error = "The manager did not confirm acceptance.";
        throw new Error(state.error);
      }
      state.message = `${id ? "Job recovery" : action === "pause" ? "Dispatch pause" : "Request to resume all work"} accepted. Refreshing the queue…`;
      if (state.refreshing) await state.refreshing;
      await refresh();
      if (state.connected) state.message = `${id ? "Job recovery" : action === "pause" ? "Dispatch pause" : "Request to resume all work"} accepted by the manager.`;
      announce(state.message);
    } catch (error) {
      state.message = `Action failed: ${error.message || "The manager did not accept the action."}`;
      announce(state.message);
    } finally {
      state.pending = false;
      renderConnection();
      schedule();
    }
  }

  document.querySelectorAll("[data-view]").forEach((node) => node.addEventListener("click", () => {
    state.view = node.dataset.view;
    state.filter = state.view === "history" ? "archived" : "all";
    $("bucketFilter").value = state.filter;
    render();
  }));
  $("search").addEventListener("input", (event) => { state.query = event.target.value; render(); });
  $("bucketFilter").addEventListener("change", (event) => {
    state.filter = event.target.value;
    state.view = "all";
    render();
  });
  $("refresh").addEventListener("click", () => refresh());
  $("dispatchToggle").addEventListener("click", () => control(shouldResumeDispatch() ? "resume" : "pause"));
  $("detailClose").addEventListener("click", () => $("jobDialog").close());
  $("jobDialog").addEventListener("close", () => {
    if (opener?.node.isConnected) opener.node.focus({ preventScroll: true });
    else {
      const row = [...document.querySelectorAll(".job-title")].find((node) => ["attention-title", "work-title"].some((prefix) => node.dataset.focusKey === `${prefix}:${opener?.id}`));
      (row || $("refresh")).focus({ preventScroll: true });
    }
    opener = null;
  });
  $("jobDialog").addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) event.currentTarget.close();
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(state.timer);
    if (document.hidden) updateControlButtons();
    else {
      state.connected = false;
      renderConnection();
      refresh();
    }
  });
  window.addEventListener("offline", () => {
    state.connected = false;
    state.error = "The browser is offline.";
    renderConnection();
  });
  window.addEventListener("online", () => refresh());
  // A suspended timer must not leave enabled controls attached to an old snapshot.
  setInterval(() => {
    if (state.connected && Date.now() - state.lastSuccess >= 12000) {
      state.connected = false;
      state.error = "The snapshot is no longer fresh.";
      renderConnection();
    }
  }, 1000);
  render();
  refresh();
})();
