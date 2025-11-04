import {execSync, spawn} from "child_process";
import {setMaxListeners} from "events";
import {AbortError} from "mock-fs/lib/error.js";

/**
 * List all tasks
 * @param {string} tasksPath - Path to the tasks.json file
 * @param {string} statusFilter - Filter by status (single status or comma-separated list, e.g., 'pending' or 'blocked,deferred')
 * @param {string} reportPath - Path to the complexity report
 * @param {boolean} withSubtasks - Whether to show subtasks
 * @param {string} outputFormat - Output format (text or json)
 * @param {Object} context - Context object (required)
 * @param {string} context.projectRoot - Project root path
 * @param {string} context.tag - Tag for the task
 * @returns {Object} - Task list result for json format
 */
function testCmd(
	tasksPath,
	statusFilter,
	reportPath = null,
	withSubtasks = false,
	outputFormat = 'text',
	context = {}
) {
	const env = {
		...process.env
	};
	let qwenPath = "";
	// qwenPath = execSync('qwen --version', {
	// 	cwd: "D:\\project\\yx\\temp-prd",
	// 	encoding: 'utf8',
	// 	env: env
	// }).trim();


	const controller = new AbortController;
	setMaxListeners(50, controller.signal);
	const stderrMode = env.DEBUG || "pipe" ;
	const args = ["code", "--output-format", "stream-json", "--verbose"];
	args.push("--print");
	args.push("--", "你是谁");
	const spawnChild = spawn('ccr', args, {
		shell: true,
		cwd: "D:\\project\\yx\\temp-prd",
		encoding: 'utf8',
		stdio: ["pipe", "pipe", stderrMode],
		signal: controller.signal,
		env: env
	});


	const childStdin = spawnChild.stdin;
	const childStdout = spawnChild.stdout;

	const cleanup = () => {
		if (spawnChild && !spawnChild.killed) {
			spawnChild.kill("SIGTERM");
		}
	};

	controller.signal.addEventListener("abort", cleanup);
	childStdout.on('data', (data) => {
		console.log('子进程输出:', data.toString());
	});
	childStdout.on('end', () => {
		console.log('childStdout 结束');
	});

	spawnChild.on("error", (error) => {
		if (controller.signal.aborted) {
			console.log("Qwen Code process aborted by user")
		} else {
			console.log(error)
		}
	});
	spawnChild.on("close", (code, signal) => {
		if (controller.signal.aborted) {
			console.log("Qwen Code process aborted by user")
		} else {
				console.log(code,signal)
		}
	});


	console.log(qwenPath)
}

export default testCmd;
