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
export declare function setOutput(name: string, value: string, outputFile: string): void;
export declare function triggerWorkflow(config: TriggerConfig): Promise<string>;
export declare function getExecutionStatus(apiKey: string, apiUrl: string, executionId: string): Promise<ExecutionStatus>;
export declare function waitForCompletion(config: PollConfig): Promise<ExecutionStatus>;
export declare function extractOutput(config: ExtractConfig): string;
export {};
