# Design Pipeline Plugin

A Figma plugin that lets you queue design changes directly on frames, components, and elements inside Figma. Type an instruction on any element, submit it, then let Claude process it from Claude Code — without leaving Figma or re-running the full pipeline.

## Installation

1. In Figma Desktop, go to **Plugins → Development → Import plugin from manifest…**
2. Navigate to this folder and select `manifest.json`
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

The plugin connects to the figma-console MCP server running on your machine. This is what
allows Claude to read and write Figma nodes while you work.

The status bar at the top of the plugin shows the connection state: `connected`, `scanning`,
or `disconnected`. The plugin works in read-only mode when disconnected.

---

## Pipeline integration

Queued instructions are picked up by Claude Code when you run `/design-pipe:listen` or
`/design-pipe:load-queue`. See the main README for the full workflow.
