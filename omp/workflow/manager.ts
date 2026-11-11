import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executeGit, WorkRepository } from "./jobs";
import type { Job, JobInput } from "./types";

export interface ModelSelection { provider: string; id: string; thinking?: string }
export interface WorkerRequest {
	cwd: string; model: ModelSelection; prompt: string; sessionDir: string;
	role?: string; reportSchema?: Record<string, unknown>; signal?: AbortSignal;
	timeoutMs?: number; onSpawn?: (worker: { pid: number; sessionDir: string }) => void;
}
export interface WorkerClient {
	run(request: WorkerRequest): Promise<{ text: string; report?: unknown; sessionFile?: string; model: ModelSelection }>;
}
export interface ManagerOptions {
	stateDir: string;
	worker: WorkerClient;
	model: ModelSelection;
	maxWorkers?: number;
	repairLimit?: number;
	modelFor?: (role: string) => ModelSelection;
	instructions?: (role: string, job: Job) => string | Promise<string>;
	onEvent?: (event: { job: Job; message: string }) => void;
}

/** One local work interface; agents cannot set states or inject pass receipts. */
export class WorkManager {
	readonly repository: WorkRepository;
	private readonly control: Database;
	private closed = false;
	private execution?: Promise<Job[]>;
	private readonly abort = new AbortController();
	private readonly owner = randomUUID();
	private modelWorkers = 0;
	private wakeups = new Set<() => void>();
	constructor(private readonly options: ManagerOptions) {
		this.repository = new WorkRepository(options.stateDir);
		this.control = new Database(join(options.stateDir, "manager.sqlite"), { create: true });
		this.control.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS controller (singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL, pid INTEGER NOT NULL, stamp TEXT)");
	}
	private isPaused(): boolean {
		return (this.control.query("SELECT value FROM settings WHERE key='paused'").get() as { value: string } | null)?.value === "true";
	}
	pause(): void {
		this.control.query("INSERT OR REPLACE INTO settings VALUES ('paused','true')").run();
		this.wake();
	}
	submit(inputs: JobInput[]): Job[] {
		if (this.closed) throw new Error("This work manager is closed.");
		const jobs = this.repository.submitMany(inputs);
		this.wake();
		return jobs;
	}
	status(): { paused: boolean; jobs: Job[] } {
		return { paused: this.isPaused(), jobs: this.repository.list() };
	}
	async start(): Promise<Job[]> {
		if (this.closed) throw new Error("This work manager is closed.");
		if (this.execution) return this.execution;
		if (this.isPaused()) return this.repository.list();
		const execution = this.dispatch();
		this.execution = execution;
		try { return await execution; }
		finally { this.execution = undefined; }
	}
	private wake(): void {
		for (const wake of this.wakeups) wake();
		this.wakeups.clear();
	}
	private wait(): Promise<void> {
		return new Promise((resolve) => this.wakeups.add(resolve));
	}
	private model(role: string): ModelSelection {
		const model = this.options.modelFor?.(role) ?? this.options.model;
		if (!model?.provider || !model.id) throw new Error(`No available selected model for ${role}.`);
		return model;
	}
	private async worker(request: WorkerRequest): Promise<Awaited<ReturnType<WorkerClient["run"]>>> {
		const limit = this.options.maxWorkers ?? 2;
		while (!this.abort.signal.aborted && (this.isPaused() || this.modelWorkers >= limit)) await this.wait();
		this.abort.signal.throwIfAborted();
		this.modelWorkers++;
		try {
			return await this.options.worker.run({ ...request, signal: this.abort.signal, onSpawn: (worker) => {
				mkdirSync(request.sessionDir, { recursive: true });
				writeFileSync(join(request.sessionDir, "process.json"), JSON.stringify({ ...worker, owner: this.owner, startedAt: new Date().toISOString() }));
				request.onSpawn?.(worker);
			} });
		} finally { this.modelWorkers--; this.wake(); }
	}
	private async dispatch(): Promise<Job[]> {
		const active = new Map<string, Promise<void>>();
		const limit = this.options.maxWorkers ?? 2;
		if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("maxWorkers must be a positive integer.");
		this.acquireController();
		try { while (!this.abort.signal.aborted) {
			const jobs = this.repository.list();
			if (!this.isPaused()) {
				for (const job of jobs) {
					if (active.size >= limit) break;
					if (job.status !== "queued" || active.has(job.id)) continue;
					if (!job.dependsOn.every((id) => this.repository.get(id)?.status === "ready")) continue;
					this.repository.claim(job.id, this.owner);
					const run = this.execute(job).finally(() => { active.delete(job.id); this.wake(); });
					active.set(job.id, run);
				}
			}
			if (!active.size) {
				if (!this.isPaused()) for (const waiting of this.repository.list().filter((job) => job.status === "queued")) {
					const failed = waiting.dependsOn.filter((id) => this.repository.get(id)?.status !== "ready");
					if (failed.length) {
						this.repository.update(waiting.id, { status: "blocked", blocker: `Blocked by dependency: ${failed.join(", ")}. Resume after its evidence is repaired.` });
						this.event(waiting.id, "A prerequisite is not ready; unrelated jobs can continue.");
					}
				}
				break;
			}
			await Promise.race([...active.values(), this.wait()]);
		} }
		finally {
			await Promise.all(active.values());
			this.control.query("DELETE FROM controller WHERE owner=?").run(this.owner);
		}
		return this.repository.list();
	}
	private processStamp(pid: number): string {
		try {
			const result = Bun.spawnSync(["ps", "-p", String(pid), "-o", "lstart="]);
			return result.exitCode === 0 ? result.stdout.toString().trim() : "";
		} catch { return ""; }
	}
	private processAlive(pid: number): boolean {
		try { process.kill(pid, 0); return true; }
		catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
	}
	private acquireController(): void {
		this.control.transaction(() => {
			const existing = this.control.query("SELECT owner,pid,stamp FROM controller WHERE singleton=1").get() as { owner: string; pid: number; stamp: string } | null;
			if (existing && existing.owner !== this.owner && this.processAlive(existing.pid)) {
				const stamp = this.processStamp(existing.pid);
				if (!stamp || !existing.stamp || stamp === existing.stamp) throw new Error(`Another work manager is already running (PID ${existing.pid}); use its session or pause it first.`);
			}
			this.control.query("INSERT OR REPLACE INTO controller VALUES (1,?,?,?)").run(this.owner, process.pid, this.processStamp(process.pid));
		}).immediate();
	}
	private current(job: Job): string {
		const branch = executeGit(job.worktree, ["symbolic-ref", "--short", "HEAD"]);
		const common = realpathSync(executeGit(job.worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
		if (branch !== job.branch || common !== job.commonDir) throw new Error(`Job ${job.id} is not in its assigned repository and branch; work was retained.`);
		if (executeGit(job.worktree, ["status", "--porcelain=v1"])) throw new Error(`Job ${job.id} has uncommitted work; it was retained for reconciliation.`);
		return executeGit(job.worktree, ["rev-parse", "HEAD"]);
	}
	private event(id: string, message: string): void {
		const job = this.repository.get(id)!;
		try { this.options.onEvent?.({ job, message }); } catch { /* State remains available through status if display fails. */ }
	}
	private async execute(initial: Job): Promise<void> {
		let job = initial;
		let feedback = "";
		try {
			const { QualityGate } = await import("./quality");
			const gate = new QualityGate({ stateDir: this.options.stateDir, worker: { run: (request: WorkerRequest) => this.worker(request) }, modelFor: (role: string) => this.model(role), signal: this.abort.signal, instructions: this.options.instructions });
			const repairs = this.options.repairLimit ?? 2;
			if (!Number.isSafeInteger(repairs) || repairs < 0) throw new Error("repairLimit must be a nonnegative integer.");
			for (let repair = 0; repair <= repairs; repair++) {
				this.abort.signal.throwIfAborted();
				job = this.repository.get(job.id)!;
				if (job.kind === "implementation" && (!job.candidate || feedback)) {
					const starting = this.current(job);
					if (job.attempt === 0 && starting !== job.base) throw new Error(`Job ${job.id} moved from its recorded starting revision; reconcile before editing.`);
					job = this.repository.update(job.id, { status: "running", attempt: job.attempt + 1 });
					const instructions = await this.options.instructions?.("implementer", job) ?? "";
					await this.worker({ cwd: job.worktree, model: this.model("implementer"), role: "implementer", sessionDir: join(this.options.stateDir, "sessions", job.id, `implementation-${job.attempt}`), prompt: `${instructions}\nYou are the implementer for job ${job.id}. Work only in ${job.worktree} on ${job.branch}.\n${job.task}\nAcceptance criteria:\n${job.acceptance.map((x) => `- ${x}`).join("\n")}\nRun relevant checks and commit your scoped changes. Preserve all unrelated work. Do not publish, claim ready, spawn other agents, or run review/integration; the manager handles those.\n${feedback ? `Repair these observed failures without changing acceptance criteria or disabling checks:\n${feedback}` : ""}` });
				}
				const revision = this.current(job);
				job = this.repository.update(job.id, { candidate: revision, status: "checking" });
				const result = await gate.verify(job);
				mkdirSync(join(this.options.stateDir, "results"), { recursive: true });
				writeFileSync(join(this.options.stateDir, "results", `${job.id}.json`), JSON.stringify(result, null, 2));
				if (result.passed) {
					gate.assertCurrent(job, result);
					if (job.integrationTarget) throw new Error("Related-ticket integration is not yet implemented.");
					this.repository.update(job.id, { status: "ready", blocker: undefined });
					this.event(job.id, "Checked and independently reviewed candidate is ready.");
					return;
				}
				feedback = result.failures.join("\n");
				if (result.disposition === "blocked") throw new Error(feedback || "Required validation/review could not complete.");
				if (repair === repairs) throw new Error(`Repair budget exhausted. ${feedback}`);
			}
		} catch (error) {
			this.repository.update(job.id, { status: this.abort.signal.aborted ? "interrupted" : "blocked", blocker: error instanceof Error ? error.message : String(error) });
			this.event(job.id, "Work needs reconciliation or repair; it is not ready.");
		} finally { this.repository.release(job.id, this.owner); }
	}
	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.abort.abort(new Error("Manager session closed; reconcile before resuming."));
		this.wake();
		await this.execution;
		this.repository.close();
		this.control.close();
	}
}
