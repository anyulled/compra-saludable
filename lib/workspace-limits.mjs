export const MAX_WORKSPACE_BYTES = 3 * 1024 * 1024;
export const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

export class WorkspaceWriteUncertainError extends Error {}

export function jsonByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function fitsWorkspaceLimit(value) {
  return jsonByteLength(value) <= MAX_WORKSPACE_BYTES;
}

export function canStartWorkspaceWrite({
  status,
  running,
  blocked,
  current,
  acknowledged,
}) {
  return (
    status === "ready" &&
    !running &&
    !blocked &&
    current === acknowledged
  );
}
