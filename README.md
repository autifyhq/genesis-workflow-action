# Genesis Workflow Action

A GitHub Action to trigger [Genesis](https://autify.com/products/autify-genesis) workflows, wait for completion, and retrieve the results. Use it to integrate any Genesis workflow into your CI/CD pipeline.

## Usage

### Trigger a workflow and get the output

```yaml
- name: Run Genesis workflow
  id: genesis
  uses: autifyhq/genesis-workflow-action@v1
  with:
    api-key: ${{ secrets.GENESIS_API_KEY }}
    workflow-id: "your-workflow-template-id"
    inputs: '{"release_tag": "${{ github.event.release.tag_name }}", "repository_id": "${{ github.repository }}"}'
    output-block: "release-summary"

- name: Use the output
  run: echo "${{ steps.genesis.outputs.output }}"
```

### Fire-and-forget (don't wait)

```yaml
- name: Trigger workflow
  uses: autifyhq/genesis-workflow-action@v1
  with:
    api-key: ${{ secrets.GENESIS_API_KEY }}
    workflow-id: "your-workflow-template-id"
    inputs: '{"event": "deploy", "environment": "production"}'
    wait: "false"
```

### Custom Genesis instance

If you're running a self-hosted Genesis instance, override `api-url`:

```yaml
- name: Run Genesis workflow
  uses: autifyhq/genesis-workflow-action@v1
  with:
    api-key: ${{ secrets.GENESIS_API_KEY }}
    api-url: "https://genesis.your-company.com"
    workflow-id: "your-workflow-template-id"
    inputs: '{"data": "value"}'
```

### Release notes to Slack (full example)

```yaml
name: Release Notes

on:
  release:
    types: [published]

jobs:
  release-notes:
    runs-on: ubuntu-latest
    steps:
      - name: Generate release notes
        id: notes
        uses: autifyhq/genesis-workflow-action@v1
        with:
          api-key: ${{ secrets.GENESIS_API_KEY }}
          workflow-id: ${{ vars.GENESIS_RELEASE_NOTES_WORKFLOW_ID }}
          inputs: '{"release_tag": "${{ github.event.release.tag_name }}", "repository_id": "${{ github.repository }}"}'
          output-block: "release-summary"

      - name: Post to Slack
        uses: slackapi/slack-github-action@v2
        with:
          method: chat.postMessage
          token: ${{ secrets.SLACK_BOT_TOKEN }}
          arguments: |
            channel: product-announcement
            text: "${{ steps.notes.outputs.output }}"
```

### Multiple output blocks

If you don't specify `output-block`, the action returns all block outputs as a JSON object:

```yaml
- name: Run workflow
  id: genesis
  uses: autifyhq/genesis-workflow-action@v1
  with:
    api-key: ${{ secrets.GENESIS_API_KEY }}
    workflow-id: "your-workflow-template-id"
    inputs: '{"data": "value"}'

# outputs.output = {"block-1": "output text", "block-2": "other output"}
- name: Parse outputs
  run: echo '${{ steps.genesis.outputs.output }}' | jq '.["block-1"]'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | Yes | — | API key for the Genesis platform |
| `api-url` | No | `https://genesis-v2.autify.com` | Base URL for the Genesis API. Override for self-hosted instances. |
| `workflow-id` | Yes | — | Genesis workflow template ID to trigger |
| `inputs` | No | `{}` | JSON object of inputs to pass to the workflow |
| `output-block` | No | — | Name of a specific block to extract output from. If not set, returns all outputs as JSON. |
| `poll-interval` | No | `120` | Seconds between status polls |
| `max-wait-time` | No | `600` | Max seconds to wait for completion |
| `wait` | No | `true` | Set to `false` to return immediately after triggering |

## Outputs

| Output | Description |
|--------|-------------|
| `execution-id` | The Genesis workflow execution ID |
| `status` | Final status: `completed`, `failed`, `cancelled`, or `running` (if `wait=false`) |
| `output` | Text from the specified `output-block`, or all block outputs as JSON |

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Trigger    │────>│  Poll until   │────>│   Extract    │
│  workflow    │     │  completed    │     │   outputs    │
└─────────────┘     └──────────────┘     └──────────────┘
      │                    │                     │
      v                    v                     v
  execution-id          status               output
```

1. **Trigger** — Calls the Genesis API to start a workflow execution with the provided inputs
2. **Poll** — Checks execution status at the configured interval until completion (or timeout)
3. **Extract** — Reads block outputs from the completed execution and sets them as action outputs

## Requirements

- A Genesis account with an API key
- A workflow template ID

## License

[MIT](LICENSE)
