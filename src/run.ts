#!/usr/bin/env node

import { extractOutput, setOutput, triggerWorkflow, waitForCompletion } from "./lib.js";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Error: ${name} environment variable is required`);
		process.exit(1);
	}
	return value;
}

const config = {
	apiKey: requireEnv("GENESIS_API_KEY"),
	apiUrl: requireEnv("GENESIS_API_BASE_URL"),
	workflowId: requireEnv("GENESIS_WORKFLOW_ID"),
	inputs: JSON.parse(process.env.GENESIS_WORKFLOW_INPUTS || "{}") as Record<string, unknown>,
	outputBlock: process.env.OUTPUT_BLOCK || "",
	pollIntervalMs: Number.parseInt(process.env.POLL_INTERVAL || "120", 10) * 1000,
	maxWaitTimeMs: Number.parseInt(process.env.MAX_WAIT_TIME || "600", 10) * 1000,
	waitForCompletion: process.env.WAIT_FOR_COMPLETION !== "false",
	outputFile: process.env.GITHUB_OUTPUT || "",
};

async function main(): Promise<void> {
	console.log("========================================");
	console.log("Genesis Workflow Action");
	console.log(`Started: ${new Date().toISOString()}`);
	console.log("========================================\n");

	try {
		const executionId = await triggerWorkflow(config);

		if (!config.waitForCompletion) {
			console.log("\nWait disabled — returning immediately");
			setOutput("status", "running", config.outputFile);
			return;
		}

		const execution = await waitForCompletion({
			apiKey: config.apiKey,
			apiUrl: config.apiUrl,
			executionId,
			pollIntervalMs: config.pollIntervalMs,
			maxWaitTimeMs: config.maxWaitTimeMs,
		});

		setOutput("status", execution.status, config.outputFile);
		extractOutput({
			execution,
			outputBlock: config.outputBlock,
			outputFile: config.outputFile,
		});

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
