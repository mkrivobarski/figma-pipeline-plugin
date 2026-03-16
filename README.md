# figma-pipeline-plugin

## Design Pipeline Plugin

A standalone Figma plugin that lets designers mark frames, components, and elements for pipeline iteration directly inside Figma. Selected nodes and instructions are stored in the file via `sharedPluginData` and picked up by the design pipeline on the next run.

## Overview

The plugin provides a side-panel UI where a designer can:

1. Select a node in Figma
2. Choose an intent (Iterate / Redesign / Fix / Review)
3. Type an iteration instruction
4. Optionally add constraints (e.g. "Keep WCAG AA contrast")
5. Submit — the instruction is stored on the node and appears in the queue

The pipeline's `annotation-scanner` agent reads the queue on the next run, processes the instructions, and writes status back so the badge in the panel reflects current state.

## Installation

1. In Figma Desktop, go to **Plugins → Development → Import plugin from manifest…**
2. Select `manifest.json` from this directory
3. The plugin will appear under **Plugins → Development → Design Pipeline**

## Directory structure

```
figma-pipeline-plugin/
├── manifest.json   — plugin registration (id, api version, network allowlist)
├── code.js         — plugin main thread (sharedPluginData read/write, queue scan)
├── ui.html         — plugin panel UI (selection display, intent pills, queue list)
└── README.md
```

## How it works

### Storage

Instructions are stored directly on the Figma node using `sharedPluginData`:

- **namespace**: `pipeline`
- **key**: `instruction`
- **value**: JSON string with the full payload

```json
{
  "instruction": "Make this button more prominent",
  "intent": "iterate",
  "constraints": "Keep WCAG AA contrast",
  "submittedAt": 1700000000000,
  "status": "pending",
  "nodeId": "123:456",
  "nodeName": "CTA Button",
  "nodeType": "INSTANCE",
  "pageName": "Hi-Fi Screens"
}
```

`sharedPluginData` persists in the `.fig` file across sessions and is readable by any plugin or by the MCP server via `figma_execute`.

### Status lifecycle

| Status | Set by |
|--------|--------|
| `pending` | Plugin (on submit) |
| `processing` | `annotation-scanner` agent (before pipeline run) |
| `done` | `design-validator` agent (after successful run) |
| `failed` | `design-validator` agent (on error) |

### Queue scan

The pipeline's `annotation-scanner` agent reads the queue by calling `figma_execute` with a script that:

1. Calls `figma.loadAllPagesAsync()`
2. Scans all pages with `findAll` + `getSharedPluginData`
3. Returns entries where `status === "pending"`

### Live notifications (optional)

When [figma-console-mcp](../figma-console-mcp/) is running, the plugin UI establishes a WebSocket connection to one of the ports in the range 9223–9232. On each successful submit, it sends a `PIPELINE_QUEUE_CHANGED` message so the MCP server can notify any listening agents immediately. This is purely additive — the plugin works fully without it.

## Pipeline integration

The TARGETED pipeline mode is triggered when `annotation-targets.json` is present in the working directory, or when `annotation-scanner` is run explicitly. See:

- `agents/design-pipeline/annotation-scanner.md`
- `agents/design-pipeline/targeted-intake-agent.md`
- `agents/design-pipeline/pipeline-intake-agent.md` (TARGETED mode section)

## Message protocol (UI ↔ main thread)

| Message type | Direction | Purpose |
|---|---|---|
| `SELECTION_CHANGE` | main → UI | Push current selection to panel |
| `PIPELINE_SUBMIT` | UI → main | Store instruction on node |
| `PIPELINE_SUBMIT_RESULT` | main → UI | Confirm or report error |
| `PIPELINE_STATUS_UPDATE` | UI → main | Write back status after pipeline run |
| `PIPELINE_STATUS_UPDATE_RESULT` | main → UI | Confirm status write |
| `PIPELINE_CLEAR` | UI → main | Remove instruction from node |
| `PIPELINE_CLEAR_RESULT` | main → UI | Confirm clear |
| `PIPELINE_SCAN_QUEUE` | UI → main | Scan all pages for queued instructions |
| `PIPELINE_SCAN_QUEUE_RESULT` | main → UI | Return filtered queue array |
