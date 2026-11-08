export function WorkspaceLoadingScreen() {
  return <main className="storage-screen"><h1>Abriendo vuestro espacio…</h1><p>Preparando los datos compartidos.</p></main>;
}

export function WorkspaceSetupScreen({ error, legacySeed, legacyCopy, downloadLegacySeed, downloadLegacy }: {
  error: string;
  legacySeed: State | null;
  legacyCopy: string | null;
  downloadLegacySeed: () => void;
  downloadLegacy: () => void;
}) {
  return (
    <main className="storage-screen">
      <h1>Espacio pendiente de importación.</h1>
      <p>El hogar compartido aún no se ha preparado. El administrador debe importar los datos o crear el seed inicial antes de habilitar las escrituras. Esta sesión no modificará el espacio vacío.</p>
      {error && <p role="alert">{error}</p>}
      <div className="storage-actions">
        {legacySeed && <button className="secondary" onClick={downloadLegacySeed}>Descargar la copia local para migrarla</button>}
        {legacyCopy && <button className="secondary" onClick={downloadLegacy}>Descargar copia antigua</button>}
        <button className="primary" onClick={() => window.location.reload()}>Comprobar de nuevo</button>
      </div>
    </main>
  );
}

export function WorkspaceConflictScreen({ error, message, legacyCopy, status, downloadCurrent, downloadLegacy, retry }: {
  error: string;
  message: string;
  legacyCopy: string | null;
  status: "conflict" | "error";
  downloadCurrent: () => void;
  downloadLegacy: () => void;
  retry: () => void;
}) {
  return (
    <main className="storage-screen">
      <h1>Hay cambios que revisar.</h1>
      <p>{error}</p>
      {message && <p role="alert">{message}</p>}
      <p>Los cambios de esta pestaña se conservan mientras permanezca abierta. Puedes descargarlos antes de volver a cargar.</p>
      <div className="storage-actions">
        <button className="primary" onClick={downloadCurrent}>Descargar cambios de esta pestaña</button>
        {legacyCopy && <button className="secondary" onClick={downloadLegacy}>Descargar copia anterior del navegador</button>}
        <button className="secondary" onClick={retry}>Volver a intentar</button>
        {status === "conflict" && <button className="text-button" onClick={() => window.location.reload()}>Descartar cambios de esta pestaña y cargar la versión compartida</button>}
      </div>
    </main>
  );
}
import type { State } from "../lib/types";

