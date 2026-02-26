import { appendFileSync } from "node:fs";

// --- Types ---

export interface TriggerConfig {
	apiKey: string;
	apiUrl: string;
	workflowId: string;
	inputs: Record<string, unknown>;
	outputFile: string;
}

export interface PollConfig {
	apiKey: string;
	apiUrl: string;
	executionId: string;
	pollIntervalMs: number;
	maxWaitTimeMs: number;
}

export interface ExtractConfig {
	execution: ExecutionStatus;
	outputBlock: string;
	outputFile: string;
}

interface TriggerResponse {
	success: boolean;
	executionId: string;
}

interface BlockState {
	output?: string;
}

export interface ExecutionStatus {
	id: string;
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	error: string | null;
	blockCount: number;
	completedBlocks: number;
	state?: {
		blocks?: Record<string, BlockState>;
	};
}

// --- GitHub Actions output helper ---

export function setOutput(name: string, value: string, outputFile: string): void {
	if (outputFile) {
		const delimiter = `ghadelimiter_${Date.now()}`;
		appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
	}
}

// --- Trigger workflow ---

export async function triggerWorkflow(config: TriggerConfig): Promise<string> {
	console.log("=== Trigger Genesis Workflow ===");
	console.log(`Workflow ID: ${config.workflowId}`);
	console.log(`Inputs: ${JSON.stringify(config.inputs)}`);

	const url = `${config.apiUrl}/api/workflows/${config.workflowId}/trigger`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"x-api-key": config.apiKey,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(config.inputs),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to trigger workflow: ${response.status} - ${error}`);
	}

	const result = (await response.json()) as TriggerResponse;

	if (!result.success || !result.executionId) {
		throw new Error(`Invalid trigger response: ${JSON.stringify(result)}`);
	}

	console.log(`Execution ID: ${result.executionId}`);
	setOutput("execution-id", result.executionId, config.outputFile);
	return result.executionId;
}

// --- Poll for completion ---

export async function getExecutionStatus(
	apiKey: string,
	apiUrl: string,
	executionId: string,
): Promise<ExecutionStatus> {
	const url = `${apiUrl}/api/executions/${executionId}`;
	const response = await fetch(url, {
		headers: { "x-api-key": apiKey },
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to get execution status: ${response.status} - ${error}`);
	}

	return (await response.json()) as ExecutionStatus;
}

export async function waitForCompletion(config: PollConfig): Promise<ExecutionStatus> {
	console.log("\n=== Wait for Completion ===");
	console.log(
		`Poll interval: ${config.pollIntervalMs / 1000}s | Max wait: ${config.maxWaitTimeMs / 1000}s`,
	);

	const startTime = Date.now();
	let pollCount = 0;

	while (true) {
		pollCount++;
		const elapsed = Date.now() - startTime;

		const status = await getExecutionStatus(config.apiKey, config.apiUrl, config.executionId);
		console.log(
			`[Poll #${pollCount}] ${Math.round(elapsed / 1000)}s elapsed — ${status.status} (${status.completedBlocks}/${status.blockCount} blocks)`,
		);

		if (status.status === "completed") {
			console.log("Workflow completed successfully");
			return status;
		}

		if (status.status === "failed") {
			throw new Error(`Workflow failed: ${status.error || "Unknown error"}`);
		}

		if (status.status === "cancelled") {
			throw new Error("Workflow was cancelled");
		}

		if (elapsed > config.maxWaitTimeMs) {
			throw new Error(
				`Timeout: workflow did not complete within ${config.maxWaitTimeMs / 1000}s (status: ${status.status})`,
			);
		}

		await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
	}
}

// --- Extract outputs ---

export function extractOutput(config: ExtractConfig): string {
	const blocks = config.execution.state?.blocks;
	if (!blocks) {
		console.log("No workflow state blocks found");
		setOutput("output", "", config.outputFile);
		return "";
	}

	if (config.outputBlock) {
		const block = blocks[config.outputBlock];
		if (!block?.output) {
			throw new Error(`No output found in workflow block "${config.outputBlock}"`);
		}
		console.log(`\n=== Output (block: ${config.outputBlock}) ===`);
		console.log(block.output);
		setOutput("output", block.output, config.outputFile);
		return block.output;
	}

	const allOutputs: Record<string, string> = {};
	for (const [name, block] of Object.entries(blocks)) {
		if (block.output) {
			allOutputs[name] = block.output;
		}
	}
	const json = JSON.stringify(allOutputs);
	console.log(`\n=== Outputs (${Object.keys(allOutputs).length} blocks) ===`);
	console.log(json);
	setOutput("output", json, config.outputFile);
	return json;
}
