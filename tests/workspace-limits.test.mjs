import test from "node:test";
import assert from "node:assert/strict";
import {
  fitsWorkspaceLimit,
  jsonByteLength,
  MAX_WORKSPACE_BYTES,
  canStartWorkspaceWrite,
} from "../lib/workspace-limits.mjs";

test("workspace payload cap accepts 3 MiB and rejects the next byte", () => {
  const prefix = { payload: "" };
  const prefixSize = jsonByteLength(prefix);
  const atLimit = { payload: "x".repeat(MAX_WORKSPACE_BYTES - prefixSize) };
  const overLimit = { payload: `${atLimit.payload}x` };

  assert.equal(jsonByteLength(atLimit), MAX_WORKSPACE_BYTES);
  assert.equal(fitsWorkspaceLimit(atLimit), true);
  assert.equal(fitsWorkspaceLimit(overLimit), false);
});

test("workspace writes reject overlapping saves and local edits in flight", () => {
  const idle = {
    status: "ready",
    running: false,
    blocked: false,
    current: "revision-a",
    acknowledged: "revision-a",
  };
  assert.equal(canStartWorkspaceWrite(idle), true);
  assert.equal(canStartWorkspaceWrite({ ...idle, running: true }), false);
  assert.equal(canStartWorkspaceWrite({ ...idle, current: "local-edit" }), false);
  assert.equal(canStartWorkspaceWrite({ ...idle, blocked: true }), false);
});
