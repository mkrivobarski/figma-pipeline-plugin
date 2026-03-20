# figma-pipeline-plugin

A Figma plugin that lets designers queue iteration instructions on frames, components, and elements directly inside Figma. Instructions are stored in the file via `sharedPluginData` and consumed by the design pipeline.

## Installation

1. In Figma Desktop, go to **Plugins → Development → Import plugin from manifest…**
2. Select `manifest.json` from this directory
3. The plugin appears under **Plugins → Development → Design Pipeline**

## Directory structure

```
figma/plugin/
├── manifest.json   — plugin registration (id, api version, network allowlist)
├── code.js         — main thread (sharedPluginData read/write, queue scan, resize)
├── ui.html         — panel UI (view navigation, queue, MCP bridge client)
└── README.md
```

---

## UI overview

The plugin uses view-based navigation. Only one view is visible at a time; the MCP bridge status bar is always visible at the top.

```
┌─────────────────────────────┐
│  ● MCP bridge status bar    │  ← always visible
├─────────────────────────────┤
│         [Home view]         │
│                             │
│  Target: Button / CTA       │
│  ○ 1 pending ›              │  ← node queue indicator
│                             │
│  [Generate] [Iterate] [Fix] │
│                             │
│  Queue (3) ●                │  ← footer link
└─────────────────────────────┘
```

**Window height is dynamic** — the plugin resizes automatically when you navigate between views (home: 200 px, detail views: ~375–390 px, queue: 340 px).

---

## Views

### Home

Shows the currently selected Figma node. Three action buttons:

| Button | State | Behaviour |
|--------|-------|-----------|
| **Generate** | Always active | Opens Generate view |
| **Iterate** | Active when node selected | Opens Iterate view |
| **Fix** | Active when node selected | Opens Fix view |

Below the target box, a **node queue indicator** shows the status of any existing instruction on the selected node (e.g. `1 pending ›`). Clicking it opens the Queue view filtered to that node.

A **Queue (N)** footer link shows the total count of items in the file queue. A coloured dot appears when there are active (pending/processing) items. Clicking opens the Queue view.

### Iterate / Fix

- Displays the target node (read-only)
- **Instruction** — free-text instruction for the pipeline (e.g. "Increase padding and improve hierarchy")
- **Constraints** — optional guardrails (e.g. "Keep WCAG AA contrast")
- **Creativity** — slider: `conservative` · `balanced` · `creative`
- Submit stores the payload on the node and navigates to the Queue view

### Generate

- **Prompt** — what to generate
- **Target page** — which Figma page to generate into
- **Constraints** — optional guardrails
- Submit stores the payload and navigates to the Queue view

### Queue

- Lists all instructions queued in the current file across all pages
- **Filter chip** — shown when the view was opened from a node indicator; shows node name with × to clear
- **Task count** — `(N)` shown next to the "Queue" title
- Each item shows: node name, page, instruction excerpt, status badge, and a **›** link that selects and zooms to the node in the canvas
- **Clear done** button removes all `done` items
- Processing items have a blue left border; failed items have a red tint and show the error on hover

---

## Storage schema

Instructions are stored on the Figma node using `sharedPluginData`:

- **namespace**: `pipeline`
- **key**: `instruction`
- **value**: JSON string

```json
{
  "instruction": "Make this button more prominent",
  "intent": "iterate",
  "constraints": "Keep WCAG AA contrast",
  "creativity": "balanced",
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

---

## MCP bridge

The plugin UI establishes a WebSocket connection to the figma-console MCP server on ports 9223–9232 (tries each in sequence; reconnects automatically). This allows MCP tools like `figma_execute` to call back into the plugin context — enabling variable reads, component scans, and node manipulation from the pipeline agents.

The bridge status bar shows connection state: `connected`, `scanning`, or `disconnected`.

When connected, submitting an instruction also sends a `PIPELINE_QUEUE_CHANGED` notification over the WebSocket so listening agents can react immediately. The plugin works fully without the MCP bridge.

---

## Message protocol (UI ↔ main thread)

| Message type | Direction | Purpose |
|---|---|---|
| `SELECTION_CHANGE` | main → UI | Push current selection to panel |
| `PIPELINE_SUBMIT` | UI → main | Store instruction on selected node |
| `PIPELINE_SUBMIT_RESULT` | main → UI | Confirm store or report error |
| `PIPELINE_GENERATE` | UI → main | Store generate instruction (no target node required) |
| `PIPELINE_GENERATE_RESULT` | main → UI | Confirm or report error |
| `PIPELINE_STATUS_UPDATE` | UI → main | Write back status after pipeline run |
| `PIPELINE_STATUS_UPDATE_RESULT` | main → UI | Confirm status write |
| `PIPELINE_CLEAR` | UI → main | Remove instruction from node |
| `PIPELINE_CLEAR_RESULT` | main → UI | Confirm clear |
| `PIPELINE_SCAN_QUEUE` | UI → main | Scan all pages for queued instructions |
| `PIPELINE_SCAN_QUEUE_RESULT` | main → UI | Return queue array |
| `PIPELINE_SELECT_NODE` | UI → main | Select and zoom to node in canvas |
| `PIPELINE_SELECT_NODE_RESULT` | main → UI | Confirm or report error |
| `UI_RESIZE` | UI → main | Request window resize to given height |

---

## Pipeline integration

The TARGETED pipeline mode is triggered when `annotation-targets.json` is present in the working directory, or when `annotation-scanner` is run explicitly. See:

- `agents/design-pipeline/annotation-scanner.md`
- `agents/design-pipeline/targeted-intake-agent.md`
- `agents/design-pipeline/pipeline-intake-agent.md` (TARGETED mode section)
