"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { initial, type State } from "./types";
import { isWorkspace } from "./storage/validate.mjs";
import {
  fitsWorkspaceLimit,
  MAX_WORKSPACE_BYTES,
  WorkspaceWriteUncertainError,
  canStartWorkspaceWrite,
} from "./workspace-limits.mjs";
import { reconcileWorkspaceWrite } from "./workspace-reconcile.mjs";
import { resetRecipesState } from "./dashboard-state.mjs";

type StorageStatus = "loading" | "setup" | "ready" | "saving" | "conflict" | "error";
const LEGACY_KEY = "mesa-v1";
const IMPORTED_KEY = "mesa-sqlite-imported-v1";
const encode = (value: State) => JSON.stringify(value);

function canFlush(active: boolean, running: boolean, blocked: boolean, acknowledged: string, current: string) {
  return active && !running && !blocked && Boolean(acknowledged) && current !== acknowledged;
}

function hasPendingEdits(active: boolean, blocked: boolean, current: string, acknowledged: string) {
  return active && !blocked && current !== acknowledged;
}

function describeSaveError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function flushSnapshot(
  snapshot: string,
  expectedRevision: number,
  save: (snapshot: string, revision: number) => Promise<{ response: Response; body: any }>,
  revision: { current: number },
  acknowledged: { current: string },
  blocked: { current: boolean },
  setError: (value: string) => void,
  setSafeStatus: (value: StorageStatus) => void,
) {
  const { response, body } = await save(snapshot, expectedRevision);
  if (response.status === 409) {
    blocked.current = true;
    setError("Otra persona guardó cambios. Descarga tus cambios o carga la versión compartida.");
    setSafeStatus("conflict");
    return;
  }
  if (!response.ok) throw Error(body.error || "No se pudo guardar el espacio compartido.");
  revision.current = body.revision;
  acknowledged.current = snapshot;
  setSafeStatus("ready");
}

function handleFlushFailure(error: unknown, blocked: { current: boolean }, setError: (value: string) => void, setSafeStatus: (value: StorageStatus) => void) {
  blocked.current = true;
  setError(describeSaveError(error, "No se pudo guardar el espacio compartido."));
  setSafeStatus("error");
}

export function warnAboutPendingEdits(event: BeforeUnloadEvent, current: string, acknowledged: string, running: boolean) {
  if (current !== acknowledged || running) {
    event.preventDefault();
    event.returnValue = "";
  }
}

function readLegacyWorkspace(storage: Storage, setCopy: (copy: string) => void, setWarning: (warning: string) => void) {
  let legacy: string | null = null;
  try {
    legacy = storage.getItem(LEGACY_KEY);
  } catch {
    setWarning("No se pudo comprobar si existe una copia anterior del navegador. El espacio compartido sigue disponible.");
  }
  if (!legacy) return { legacy, old: null as State | null };
  try {
    const old = JSON.parse(legacy) as State;
    if (!isWorkspace(old)) throw Error();
    return { legacy, old };
  } catch {
    setCopy(legacy);
    setWarning("La copia anterior del navegador no tiene un formato reconocido; descárgala para conservarla.");
    return { legacy, old: null as State | null };
  }
}

function shouldExposeLegacyCopy(old: State | null, remote: State, storage: Storage) {
  if (!old || encode(old) === encode(remote)) return false;
  try {
    return storage.getItem(IMPORTED_KEY) !== "1";
  } catch {
    return true;
  }
}

function applyInitialWorkspace(remote: { state: State | null; revision: number }, legacy: { legacy: string | null; old: State | null }, active: boolean, refs: { revision: { current: number }; acknowledged: { current: string }; current: { current: string } }, setters: { setData: (state: State) => void; setStatus: (status: StorageStatus) => void; setLegacyCopy: (copy: string | null) => void; setLegacySeed: (state: State | null) => void }) {
  if (!active) return;
  if (!remote.state) {
    const preview = legacy.old || initial;
    refs.revision.current = remote.revision;
    refs.acknowledged.current = "";
    refs.current.current = encode(preview);
    setters.setLegacySeed(legacy.old);
    setters.setData(preview);
    setters.setStatus("setup");
    return;
  }
  if (!isWorkspace(remote.state)) throw Error("La base de datos contiene datos que esta versión no reconoce.");
  if (shouldExposeLegacyCopy(legacy.old, remote.state, localStorage)) setters.setLegacyCopy(legacy.legacy);
  refs.revision.current = remote.revision;
  refs.acknowledged.current = encode(remote.state);
  refs.current.current = refs.acknowledged.current;
  setters.setData(remote.state);
  setters.setStatus("ready");
}

type WorkspaceRemote = { state: State | null; revision: number };
type Mutable<T> = { current: T };

function refreshIsPaused(running: Mutable<boolean>, blocked: Mutable<boolean>, current: Mutable<string>, acknowledged: Mutable<string>) {
  return running.current || blocked.current || current.current !== acknowledged.current;
}

function remoteNeedsRefresh(remote: WorkspaceRemote, revision: Mutable<number>) {
  return Boolean(remote.state) && remote.revision !== revision.current;
}

function recordRemoteWorkspace(remote: WorkspaceRemote, revision: Mutable<number>, acknowledged: Mutable<string>, current: Mutable<string>, setData: (state: State) => void) {
  if (!remote.state) return;
  if (!isWorkspace(remote.state)) throw Error("La base de datos contiene datos no reconocidos.");
  revision.current = remote.revision;
  acknowledged.current = encode(remote.state);
  current.current = acknowledged.current;
  setData(remote.state);
}

async function refreshWorkspace(read: () => Promise<WorkspaceRemote>, active: Mutable<boolean>, running: Mutable<boolean>, blocked: Mutable<boolean>, current: Mutable<string>, acknowledged: Mutable<string>, revision: Mutable<number>, setData: (state: State) => void, setError: (value: string) => void, setStatus: (status: StorageStatus) => void) {
  if (refreshIsPaused(running, blocked, current, acknowledged)) return;
  try {
    const remote = await read();
    if (!active.current || refreshIsPaused(running, blocked, current, acknowledged)) return;
    if (remoteNeedsRefresh(remote, revision)) recordRemoteWorkspace(remote, revision, acknowledged, current, setData);
  } catch (error) {
    if (!active.current) return;
    blocked.current = true;
    setError(error instanceof Error ? error.message : "No se pudo leer el espacio compartido.");
    setStatus("error");
  }
}

type WorkspaceWriteContext = {
  next: State;
  base: State;
  snapshot: string;
  revision: Mutable<number>;
  acknowledged: Mutable<string>;
  blocked: Mutable<boolean>;
  setData: (update: (latest: State) => State) => void;
  setError: (value: string) => void;
  setStatus: (status: StorageStatus) => void;
};

function commitWorkspaceWrite(context: WorkspaceWriteContext, recovered = false) {
  context.acknowledged.current = context.snapshot;
  if (recovered) {
    context.blocked.current = false;
    context.setError("");
  }
  context.setData((latest) => reconcileWorkspaceWrite(context.base, latest, context.next));
  context.setStatus("ready");
}

async function verifyWorkspaceWrite(read: () => Promise<WorkspaceRemote>) {
  try {
    const remote = await read();
    return { confirmed: true, remote };
  } catch {
    return { confirmed: false, remote: null };
  }
}

async function recoverWorkspaceWrite(error: unknown, read: () => Promise<WorkspaceRemote>, context: WorkspaceWriteContext) {
  const verification = await verifyWorkspaceWrite(read);
  const remote = verification.remote;
  if (remote?.state && encode(remote.state) === context.snapshot) {
    context.revision.current = remote.revision;
    commitWorkspaceWrite(context, true);
    return true;
  }
  if (!verification.confirmed) {
    const uncertain = new WorkspaceWriteUncertainError("No se pudo confirmar el guardado. El PDF permanece en el almacenamiento privado; recarga el espacio para comprobar si el borrador llegó a guardarse.");
    context.blocked.current = true;
    context.setError(uncertain.message);
    context.setStatus("error");
    throw uncertain;
  }
  if (!context.blocked.current) {
    context.blocked.current = true;
    context.setError(describeSaveError(error, "No se pudo guardar el borrador."));
    context.setStatus("error");
  }
  return false;
}

async function waitForIdleWorkspace(running: Mutable<boolean>, maxAttempts = 20) {
  let attempts = 0;
  while (running.current && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 50));
    attempts++;
  }
}

async function saveWithRebase(
  snapshot: string,
  revision: Mutable<number>,
  save: (snapshot: string, rev: number) => Promise<{ response: Response; body: any }>,
  read: () => Promise<WorkspaceRemote>,
) {
  let res = await save(snapshot, revision.current);
  if (res.response.status === 409) {
    console.warn("[resetWorkspace] Conflicto de revisión al guardar (409). Reintentando con la versión más reciente del servidor...");
    const remote = await read();
    if (remote.state) {
      const rebased = encode(resetRecipesState(remote.state));
      res = await save(rebased, remote.revision);
    }
  }
  return res;
}

export function useWorkspace() {
  const [data, setData] = useState<State>(initial);
  const [status, setStatus] = useState<StorageStatus>("loading");
  const [error, setError] = useState("");
  const [legacyCopy, setLegacyCopy] = useState<string | null>(null);
  const [legacySeed, setLegacySeed] = useState<State | null>(null);
  const [legacyWarning, setLegacyWarning] = useState("");
  const revision = useRef(0);
  const acknowledged = useRef("");
  const current = useRef(encode(initial));
  const active = useRef(false);
  const running = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setSafeStatus = useCallback((value: StorageStatus) => {
    if (active.current) setStatus(value);
  }, []);
  const read = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok)
      throw Error(
        "No se pudo acceder al espacio compartido. Comprueba la conexión e inténtalo de nuevo.",
      );
    return (await response.json()) as { state: State | null; revision: number };
  }, []);
  const save = useCallback(
    async (snapshot: string, expectedRevision: number) => {
      if (new TextEncoder().encode(snapshot).byteLength > MAX_WORKSPACE_BYTES)
        throw Error("El espacio compartido supera el límite de 3 MiB.");
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: JSON.parse(snapshot), expectedRevision }),
      });
      const body = await response.json();
      return { response, body };
    },
    [],
  );
  const flush = useCallback(
    async function flushLatest() {
      if (!canFlush(active.current, running.current, blocked.current, acknowledged.current, current.current)) return;
      running.current = true;
      setSafeStatus("saving");
      const snapshot = current.current;
      const expected = revision.current;
      try {
        await flushSnapshot(snapshot, expected, save, revision, acknowledged, blocked, setError, setSafeStatus);
      } catch (e) {
        handleFlushFailure(e, blocked, setError, setSafeStatus);
      } finally {
        running.current = false;
        if (hasPendingEdits(active.current, blocked.current, current.current, acknowledged.current))
          void flushLatest();
      }
    },
    [save, setSafeStatus],
  );
  useEffect(() => {
    active.current = true;
    (async () => {
      try {
        const legacy = readLegacyWorkspace(localStorage, setLegacyCopy, setLegacyWarning);
        const remote = await read();
        applyInitialWorkspace(remote, legacy, active.current, { revision, acknowledged, current }, { setData, setStatus, setLegacyCopy, setLegacySeed });
      } catch (e) {
        if (!active.current) return;
        blocked.current = true;
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los datos.",
        );
        setStatus("error");
      }
    })();
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [read, save]);
  useEffect(() => {
    if (status === "loading" || status === "setup" || !acknowledged.current) return;
    current.current = encode(data);
    if (current.current === acknowledged.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, status, flush]);
  // Refresh only when no local edits or writes are pending; CAS protects simultaneous edits.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => void refreshWorkspace(read, active, running, blocked, current, acknowledged, revision, setData, setError, setStatus), 4000);
    return () => clearInterval(t);
  }, [status, read]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => warnAboutPendingEdits(event, current.current, acknowledged.current, running.current);
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const retry = useCallback(async () => {
    setStatus("loading");
    try {
      const remote = await read();
      const snapshot = current.current;
      if (remote.state && encode(remote.state) === snapshot) {
        revision.current = remote.revision;
        acknowledged.current = snapshot;
        blocked.current = false;
        setError("");
        setStatus("ready");
        return;
      }
      if (remote.revision === revision.current && acknowledged.current) {
        blocked.current = false;
        setError("");
        setStatus("ready");
        void flush();
        return;
      }
      if (!acknowledged.current) {
        window.location.reload();
        return;
      }
      blocked.current = true;
      setError(
        "La base de datos cambió mientras había cambios pendientes. Descarga tus datos antes de recargar.",
      );
      setStatus("conflict");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo acceder al espacio compartido.");
      setStatus("error");
    }
  }, [read, flush]);
  const persistWorkspace = useCallback(
    async (next: State) => {
      if (!canStartWorkspaceWrite({
        status,
        running: running.current,
        blocked: blocked.current,
        current: current.current,
        acknowledged: acknowledged.current,
      }))
        throw Error("Hay cambios pendientes. Espera a que se guarden antes de importar otro PDF.");
      if (!isWorkspace(next) || !fitsWorkspaceLimit(next))
        throw Error("Los borradores superarían el límite de 3 MiB del espacio compartido.");
      const snapshot = encode(next);
      const base = JSON.parse(acknowledged.current) as State;
      running.current = true;
      setSafeStatus("saving");
      const context: WorkspaceWriteContext = { next, base, snapshot, revision, acknowledged, blocked, setData, setError, setStatus: setSafeStatus };
      try {
        const { response, body } = await save(snapshot, revision.current);
        if (response.status === 409) {
          blocked.current = true;
          setError("Otra persona guardó cambios. Carga la versión compartida antes de importar.");
          setSafeStatus("conflict");
          throw Error("El espacio compartido cambió. Se ha cancelado la importación.");
        }
        if (!response.ok) throw Error(body.error || "No se pudo guardar el borrador.");
        revision.current = body.revision;
        commitWorkspaceWrite(context);
      } catch (e) {
        if (await recoverWorkspaceWrite(e, read, context)) return;
        throw e;
      } finally {
        running.current = false;
      }
    },
    [read, save, setSafeStatus, status],
  );
  const resetWorkspace = useCallback(
    async (next: State) => {
      console.info("[resetWorkspace] Guardando espacio restablecido...");
      if (!isWorkspace(next) || !fitsWorkspaceLimit(next)) {
        throw Error("El espacio restablecido no es válido o supera el límite de 3 MiB.");
      }
      await waitForIdleWorkspace(running);
      if (running.current) {
        throw Error("Hay una operación de guardado en curso. Inténtalo de nuevo.");
      }
      const snapshot = encode(next);
      running.current = true;
      setSafeStatus("saving");
      try {
        const { response, body } = await saveWithRebase(snapshot, revision, save, read);
        if (!response.ok) throw Error(body?.error || "No se pudo guardar el espacio restablecido.");
        revision.current = body.revision;
        acknowledged.current = snapshot;
        current.current = snapshot;
        blocked.current = false;
        setError("");
        setData(next);
        setSafeStatus("ready");
        console.info("[resetWorkspace] Espacio restablecido con éxito. Revisión:", body.revision);
      } finally {
        running.current = false;
      }
    },
    [read, save, setSafeStatus],
  );
  const download = useCallback((content: string, filename: string) => {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);
  return {
    data,
    setData,
    status,
    error,
    legacyCopy,
    legacySeed,
    legacyWarning,
    retry,
    persistWorkspace,
    resetWorkspace,
    downloadLegacySeed: () =>
      legacySeed && download(JSON.stringify(legacySeed), "mesa-copia-navegador.json"),
    downloadCurrent: () =>
      download(current.current, "mesa-cambios-pendientes.json"),
    downloadLegacy: () =>
      legacyCopy && download(legacyCopy, "mesa-copia-navegador.json"),
  };
}
