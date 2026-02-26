#!/usr/bin/env node

import { appendFileSync } from "node:fs";

// --- Configuration ---

function requireEnv(name) {
	const value = process.env[name];
	if (!value) {
		console.error(`Error: ${name} environment variable is required`);
		process.exit(1);
	}
	return value;
}

const GENESIS_API_KEY = requireEnv("GENESIS_API_KEY");
const GENESIS_API_BASE_URL = requireEnv("GENESIS_API_BASE_URL");
const GENESIS_WORKFLOW_ID = requireEnv("GENESIS_WORKFLOW_ID");
const WORKFLOW_INPUTS = JSON.parse(process.env.GENESIS_WORKFLOW_INPUTS || "{}");
const OUTPUT_BLOCK = process.env.OUTPUT_BLOCK || "";
const POLL_INTERVAL_MS = Number.parseInt(process.env.POLL_INTERVAL || "120", 10) * 1000;
const MAX_WAIT_TIME_MS = Number.parseInt(process.env.MAX_WAIT_TIME || "600", 10) * 1000;
const WAIT_FOR_COMPLETION = process.env.WAIT_FOR_COMPLETION !== "false";
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT || "";

// --- GitHub Actions output helper ---

function setOutput(name, value) {
	if (GITHUB_OUTPUT) {
		const delimiter = `ghadelimiter_${Date.now()}`;
		appendFileSync(GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
	}
}

// --- Step 1: Trigger the workflow ---

async function triggerWorkflow() {
	console.log("=== Trigger Genesis Workflow ===");
	console.log(`Workflow ID: ${GENESIS_WORKFLOW_ID}`);
	console.log(`Inputs: ${JSON.stringify(WORKFLOW_INPUTS)}`);

	const url = `${GENESIS_API_BASE_URL}/api/workflows/${GENESIS_WORKFLOW_ID}/trigger`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"x-api-key": GENESIS_API_KEY,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(WORKFLOW_INPUTS),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to trigger workflow: ${response.status} - ${error}`);
	}

	const result = await response.json();

	if (!result.success || !result.executionId) {
		throw new Error(`Invalid trigger response: ${JSON.stringify(result)}`);
	}

	console.log(`Execution ID: ${result.executionId}`);
	setOutput("execution-id", result.executionId);
	return result.executionId;
}

// --- Step 2: Poll for completion ---

async function waitForCompletion(executionId) {
	console.log("\n=== Wait for Completion ===");
	console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s | Max wait: ${MAX_WAIT_TIME_MS / 1000}s`);

	const startTime = Date.now();
	let pollCount = 0;

	while (true) {
		pollCount++;
		const elapsed = Date.now() - startTime;

		const status = await getExecutionStatus(executionId);
		console.log(
			`[Poll #${pollCount}] ${Math.round(elapsed / 1000)}s elapsed — ${status.status} (${status.completedBlocks}/${status.blockCount} blocks)`
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

		if (elapsed > MAX_WAIT_TIME_MS) {
			throw new Error(
				`Timeout: workflow did not complete within ${MAX_WAIT_TIME_MS / 1000}s (status: ${status.status})`
			);
		}

		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
}

async function getExecutionStatus(executionId) {
	const url = `${GENESIS_API_BASE_URL}/api/executions/${executionId}`;
	const response = await fetch(url, {
		headers: { "x-api-key": GENESIS_API_KEY },
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to get execution status: ${response.status} - ${error}`);
	}

	return response.json();
}

// --- Step 3: Extract outputs ---

function extractOutput(execution) {
	const blocks = execution.state?.blocks;
	if (!blocks) {
		console.log("No workflow state blocks found");
		setOutput("output", "");
		return;
	}

	if (OUTPUT_BLOCK) {
		const block = blocks[OUTPUT_BLOCK];
		if (!block?.output) {
			throw new Error(`No output found in workflow block "${OUTPUT_BLOCK}"`);
		}
		console.log(`\n=== Output (block: ${OUTPUT_BLOCK}) ===`);
		console.log(block.output);
		setOutput("output", block.output);
	} else {
		const allOutputs = {};
		for (const [name, block] of Object.entries(blocks)) {
			if (block.output) {
				allOutputs[name] = block.output;
			}
		}
		const json = JSON.stringify(allOutputs);
		console.log(`\n=== Outputs (${Object.keys(allOutputs).length} blocks) ===`);
		console.log(json);
		setOutput("output", json);
	}
}

// --- Main ---

async function main() {
	console.log("========================================");
	console.log("Genesis Workflow Action");
	console.log(`Started: ${new Date().toISOString()}`);
	console.log("========================================\n");

	try {
		const executionId = await triggerWorkflow();

		if (!WAIT_FOR_COMPLETION) {
			console.log("\nWait disabled — returning immediately");
			setOutput("status", "running");
			return;
		}

		const execution = await waitForCompletion(executionId);
		setOutput("status", execution.status);
		extractOutput(execution);

		console.log("\n========================================");
		console.log("Done");
		console.log(`Completed: ${new Date().toISOString()}`);
		console.log("========================================");
	} catch (error) {
		console.error("\n========================================");
		console.error("Error:", error instanceof Error ? error.message : String(error));
		console.error("========================================");
		process.exit(1);
	}
}

main();
