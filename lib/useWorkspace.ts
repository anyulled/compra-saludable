"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { initial, type State } from "./types";
import { isWorkspace } from "./storage/validate.mjs";

type StorageStatus = "loading" | "ready" | "saving" | "conflict" | "error";
const LEGACY_KEY = "mesa-v1";
const IMPORTED_KEY = "mesa-sqlite-imported-v1";
const encode = (value: State) => JSON.stringify(value);

export function useWorkspace() {
  const [data, setData] = useState<State>(initial);
  const [status, setStatus] = useState<StorageStatus>("loading");
  const [error, setError] = useState("");
  const [legacyCopy, setLegacyCopy] = useState<string | null>(null);
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
        "No se pudo acceder a SQLite. Comprueba que la aplicación está en marcha.",
      );
    return (await response.json()) as { state: State | null; revision: number };
  }, []);
  const save = useCallback(
    async (snapshot: string, expectedRevision: number) => {
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
            "Otra pestaña guardó cambios. Descarga tus cambios o carga la versión de SQLite.",
          );
          setSafeStatus("conflict");
          return;
        }
        if (!response.ok)
          throw Error(body.error || "No se pudo guardar en SQLite.");
        revision.current = body.revision;
        acknowledged.current = snapshot;
        setSafeStatus("ready");
      } catch (e) {
        blocked.current = true;
        setError(
          e instanceof Error ? e.message : "No se pudo guardar en SQLite.",
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
            "No se pudo comprobar si existe una copia anterior del navegador. SQLite sigue disponible.",
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
        if (remote.state === null && old) {
          const result = await save(encode(old), 0);
          if (result.response.ok) {
            remote = { state: old, revision: result.body.revision };
            try {
              localStorage.setItem(IMPORTED_KEY, "1");
            } catch {}
          } else if (result.response.status === 409) {
            remote = await read();
          } else
            throw Error("No se pudo importar la copia del navegador a SQLite.");
        }
        const chosen = remote.state || initial;
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
    if (status === "loading" || !acknowledged.current) return;
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
          setError(e instanceof Error ? e.message : "No se pudo leer SQLite.");
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
      setError(e instanceof Error ? e.message : "No se pudo acceder a SQLite.");
      setStatus("error");
    }
  }, [read, flush]);
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
    legacyWarning,
    retry,
    downloadCurrent: () =>
      download(current.current, "mesa-cambios-pendientes.json"),
    downloadLegacy: () =>
      legacyCopy && download(legacyCopy, "mesa-copia-navegador.json"),
  };
}
