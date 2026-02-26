import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { extractOutput, setOutput, triggerWorkflow, waitForCompletion } from "../src/lib.js";
describe("setOutput", () => {
    const tmpFile = join(tmpdir(), `test-output-${Date.now()}`);
    afterEach(() => {
        if (existsSync(tmpFile))
            unlinkSync(tmpFile);
    });
    it("writes nothing when outputFile is empty", () => {
        setOutput("key", "value", "");
        // no file created
        assert.equal(existsSync(tmpFile), false);
    });
    it("writes key-value pair to output file", () => {
        writeFileSync(tmpFile, "");
        setOutput("my-key", "my-value", tmpFile);
        const content = readFileSync(tmpFile, "utf-8");
        assert.ok(content.includes("my-key<<ghadelimiter_"));
        assert.ok(content.includes("my-value"));
    });
    it("appends multiple outputs to the same file", () => {
        writeFileSync(tmpFile, "");
        setOutput("key1", "val1", tmpFile);
        setOutput("key2", "val2", tmpFile);
        const content = readFileSync(tmpFile, "utf-8");
        assert.ok(content.includes("key1"));
        assert.ok(content.includes("key2"));
        assert.ok(content.includes("val1"));
        assert.ok(content.includes("val2"));
    });
});
describe("extractOutput", () => {
    const tmpFile = join(tmpdir(), `test-extract-${Date.now()}`);
    beforeEach(() => {
        writeFileSync(tmpFile, "");
    });
    afterEach(() => {
        if (existsSync(tmpFile))
            unlinkSync(tmpFile);
    });
    it("returns empty string when no blocks exist", () => {
        const execution = {
            id: "exec-1",
            status: "completed",
            error: null,
            blockCount: 0,
            completedBlocks: 0,
        };
        const result = extractOutput({ execution, outputBlock: "", outputFile: tmpFile });
        assert.equal(result, "");
    });
    it("extracts specific block output", () => {
        const execution = {
            id: "exec-1",
            status: "completed",
            error: null,
            blockCount: 2,
            completedBlocks: 2,
            state: {
                blocks: {
                    "my-block": { output: "Hello from block" },
                    "other-block": { output: "Other output" },
                },
            },
        };
        const result = extractOutput({
            execution,
            outputBlock: "my-block",
            outputFile: tmpFile,
        });
        assert.equal(result, "Hello from block");
        const content = readFileSync(tmpFile, "utf-8");
        assert.ok(content.includes("Hello from block"));
    });
    it("throws when specified block has no output", () => {
        const execution = {
            id: "exec-1",
            status: "completed",
            error: null,
            blockCount: 1,
            completedBlocks: 1,
            state: {
                blocks: {
                    "empty-block": {},
                },
            },
        };
        assert.throws(() => extractOutput({ execution, outputBlock: "empty-block", outputFile: tmpFile }), /No output found in workflow block "empty-block"/);
    });
    it("throws when specified block does not exist", () => {
        const execution = {
            id: "exec-1",
            status: "completed",
            error: null,
            blockCount: 1,
            completedBlocks: 1,
            state: {
                blocks: {
                    "existing-block": { output: "data" },
                },
            },
        };
        assert.throws(() => extractOutput({ execution, outputBlock: "missing-block", outputFile: tmpFile }), /No output found in workflow block "missing-block"/);
    });
    it("returns all outputs as JSON when no outputBlock specified", () => {
        const execution = {
            id: "exec-1",
            status: "completed",
            error: null,
            blockCount: 2,
            completedBlocks: 2,
            state: {
                blocks: {
                    "block-a": { output: "output A" },
                    "block-b": { output: "output B" },
                    "block-c": {},
                },
            },
        };
        const result = extractOutput({ execution, outputBlock: "", outputFile: tmpFile });
        const parsed = JSON.parse(result);
        assert.deepEqual(parsed, { "block-a": "output A", "block-b": "output B" });
    });
});
describe("triggerWorkflow", () => {
    it("returns execution ID on success", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => Response.json({ success: true, executionId: "exec-123" }));
        try {
            const id = await triggerWorkflow({
                apiKey: "test-key",
                apiUrl: "https://api.example.com",
                workflowId: "wf-1",
                inputs: { foo: "bar" },
                outputFile: "",
            });
            assert.equal(id, "exec-123");
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    it("throws on non-OK response", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => new Response("Unauthorized", { status: 401 }));
        try {
            await assert.rejects(() => triggerWorkflow({
                apiKey: "bad-key",
                apiUrl: "https://api.example.com",
                workflowId: "wf-1",
                inputs: {},
                outputFile: "",
            }), /Failed to trigger workflow: 401/);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    it("throws on invalid response body", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => Response.json({ success: false }));
        try {
            await assert.rejects(() => triggerWorkflow({
                apiKey: "test-key",
                apiUrl: "https://api.example.com",
                workflowId: "wf-1",
                inputs: {},
                outputFile: "",
            }), /Invalid trigger response/);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
});
describe("waitForCompletion", () => {
    it("returns immediately when status is completed", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => Response.json({
            id: "exec-1",
            status: "completed",
            error: null,
            blockCount: 1,
            completedBlocks: 1,
        }));
        try {
            const result = await waitForCompletion({
                apiKey: "key",
                apiUrl: "https://api.example.com",
                executionId: "exec-1",
                pollIntervalMs: 10,
                maxWaitTimeMs: 1000,
            });
            assert.equal(result.status, "completed");
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    it("throws on failed status", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => Response.json({
            id: "exec-1",
            status: "failed",
            error: "Something went wrong",
            blockCount: 1,
            completedBlocks: 0,
        }));
        try {
            await assert.rejects(() => waitForCompletion({
                apiKey: "key",
                apiUrl: "https://api.example.com",
                executionId: "exec-1",
                pollIntervalMs: 10,
                maxWaitTimeMs: 1000,
            }), /Workflow failed: Something went wrong/);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    it("throws on cancelled status", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => Response.json({
            id: "exec-1",
            status: "cancelled",
            error: null,
            blockCount: 1,
            completedBlocks: 0,
        }));
        try {
            await assert.rejects(() => waitForCompletion({
                apiKey: "key",
                apiUrl: "https://api.example.com",
                executionId: "exec-1",
                pollIntervalMs: 10,
                maxWaitTimeMs: 1000,
            }), /Workflow was cancelled/);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    it("polls until completed", async () => {
        const originalFetch = globalThis.fetch;
        let callCount = 0;
        globalThis.fetch = mock.fn(async () => {
            callCount++;
            if (callCount < 3) {
                return Response.json({
                    id: "exec-1",
                    status: "running",
                    error: null,
                    blockCount: 2,
                    completedBlocks: callCount,
                });
            }
            return Response.json({
                id: "exec-1",
                status: "completed",
                error: null,
                blockCount: 2,
                completedBlocks: 2,
            });
        });
        try {
            const result = await waitForCompletion({
                apiKey: "key",
                apiUrl: "https://api.example.com",
                executionId: "exec-1",
                pollIntervalMs: 10,
                maxWaitTimeMs: 5000,
            });
            assert.equal(result.status, "completed");
            assert.equal(callCount, 3);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
    it("throws on timeout", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(async () => Response.json({
            id: "exec-1",
            status: "running",
            error: null,
            blockCount: 2,
            completedBlocks: 0,
        }));
        try {
            await assert.rejects(() => waitForCompletion({
                apiKey: "key",
                apiUrl: "https://api.example.com",
                executionId: "exec-1",
                pollIntervalMs: 10,
                maxWaitTimeMs: 50,
            }), /Timeout/);
        }
        finally {
            globalThis.fetch = originalFetch;
        }
    });
});
