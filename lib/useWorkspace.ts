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

type StorageStatus = "loading" | "setup" | "ready" | "saving" | "conflict" | "error";
const LEGACY_KEY = "mesa-v1";
const IMPORTED_KEY = "mesa-sqlite-imported-v1";
const encode = (value: State) => JSON.stringify(value);

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
      if (
        !active.current ||
        running.current ||
        blocked.current ||
        !acknowledged.current ||
        current.current === acknowledged.current
      )
        return;
      running.current = true;
      setSafeStatus("saving");
      const snapshot = current.current;
      const expected = revision.current;
      try {
        const { response, body } = await save(snapshot, expected);
        if (response.status === 409) {
          blocked.current = true;
          setError(
            "Otra persona guardó cambios. Descarga tus cambios o carga la versión compartida.",
          );
          setSafeStatus("conflict");
          return;
        }
        if (!response.ok)
          throw Error(body.error || "No se pudo guardar el espacio compartido.");
        revision.current = body.revision;
        acknowledged.current = snapshot;
        setSafeStatus("ready");
      } catch (e) {
        blocked.current = true;
        setError(
          e instanceof Error ? e.message : "No se pudo guardar el espacio compartido.",
        );
        setSafeStatus("error");
      } finally {
        running.current = false;
        if (
          active.current &&
          !blocked.current &&
          current.current !== acknowledged.current
        )
          void flushLatest();
      }
    },
    [save, setSafeStatus],
  );
  useEffect(() => {
    active.current = true;
    (async () => {
      try {
        let legacy: string | null = null;
        try {
          legacy = localStorage.getItem(LEGACY_KEY);
        } catch {
          setLegacyWarning(
            "No se pudo comprobar si existe una copia anterior del navegador. El espacio compartido sigue disponible.",
          );
        }
        let old: State | null = null;
        if (legacy) {
          try {
            old = JSON.parse(legacy);
            if (!isWorkspace(old)) throw Error();
          } catch {
            old = null;
            setLegacyCopy(legacy);
            setLegacyWarning(
              "La copia anterior del navegador no tiene un formato reconocido; descárgala para conservarla.",
            );
          }
        }
        let remote = await read();
        if (!active.current) return;
        if (remote.state === null) {
          const preview = old || initial;
          revision.current = remote.revision;
          acknowledged.current = "";
          current.current = encode(preview);
          setLegacySeed(old);
          setData(preview);
          setStatus("setup");
          return;
        }
        const chosen = remote.state;
        if (!isWorkspace(chosen))
          throw Error(
            "La base de datos contiene datos que esta versión no reconoce.",
          );
        if (old && remote.state && encode(old) !== encode(remote.state)) {
          let migrated = false;
          try {
            migrated = localStorage.getItem(IMPORTED_KEY) === "1";
          } catch {}
          if (!migrated) setLegacyCopy(legacy);
        }
        revision.current = remote.revision;
        acknowledged.current = encode(chosen);
        current.current = acknowledged.current;
        setData(chosen);
        setStatus("ready");
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
    const t = setInterval(async () => {
      if (
        running.current ||
        blocked.current ||
        current.current !== acknowledged.current
      )
        return;
      try {
        const remote = await read();
        if (
          !active.current ||
          running.current ||
          blocked.current ||
          current.current !== acknowledged.current
        )
          return;
        if (remote.state && remote.revision !== revision.current) {
          if (!isWorkspace(remote.state))
            throw Error("La base de datos contiene datos no reconocidos.");
          revision.current = remote.revision;
          acknowledged.current = encode(remote.state);
          current.current = acknowledged.current;
          setData(remote.state);
        }
      } catch (e) {
        if (active.current) {
          blocked.current = true;
          setError(e instanceof Error ? e.message : "No se pudo leer el espacio compartido.");
          setStatus("error");
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [status, read]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (current.current !== acknowledged.current || running.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
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
        acknowledged.current = snapshot;
        setData((latest) => reconcileWorkspaceWrite(base, latest, next));
        setSafeStatus("ready");
      } catch (e) {
        let confirmed = false;
        try {
          const remote = await read();
          confirmed = true;
          if (remote.state && encode(remote.state) === snapshot) {
            revision.current = remote.revision;
            acknowledged.current = snapshot;
            blocked.current = false;
            setError("");
            setData((latest) => reconcileWorkspaceWrite(base, latest, next));
            setSafeStatus("ready");
            return;
          }
        } catch {}
        if (!confirmed) {
          const uncertain = new WorkspaceWriteUncertainError(
            "No se pudo confirmar el guardado. El PDF permanece en el almacenamiento privado; recarga el espacio para comprobar si el borrador llegó a guardarse.",
          );
          blocked.current = true;
          setError(uncertain.message);
          setSafeStatus("error");
          throw uncertain;
        }
        if (!blocked.current) {
          blocked.current = true;
          setError(e instanceof Error ? e.message : "No se pudo guardar el borrador.");
          setSafeStatus("error");
        }
        throw e;
      } finally {
        running.current = false;
      }
    },
    [read, save, setSafeStatus, status],
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
    downloadLegacySeed: () =>
      legacySeed && download(JSON.stringify(legacySeed), "mesa-copia-navegador.json"),
    downloadCurrent: () =>
      download(current.current, "mesa-cambios-pendientes.json"),
    downloadLegacy: () =>
      legacyCopy && download(legacyCopy, "mesa-copia-navegador.json"),
  };
}
