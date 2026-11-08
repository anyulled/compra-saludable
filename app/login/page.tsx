import { redirect } from "next/navigation";
import { requireAuthorizedUser } from "../../lib/supabase/server";
import { isAuthConfigured } from "../../lib/supabase/authorization";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = isAuthConfigured();
  if (configured && (await requireAuthorizedUser())) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="auth-brand-icon">✳</span>
        <p className="auth-eyebrow">COMER BIEN, JUNTOS</p>
        <h1>Vuestra mesa, <em>en orden.</em></h1>
        <p className="auth-copy">
          Inicia sesión con una de las dos cuentas autorizadas para acceder al
          plan compartido.
        </p>
        {error === "unauthorized" && (
          <p className="auth-error" role="alert">
            Esta cuenta de Google no tiene acceso a este espacio.
          </p>
        )}
        {error === "auth" && (
          <p className="auth-error" role="alert">
            No se pudo completar el inicio de sesión. Inténtalo de nuevo.
          </p>
        )}
        {!configured && (
          <p className="auth-error" role="alert">
            El acceso está pendiente de configuración en el entorno.
          </p>
        )}
        <a
          className="google-button"
          href={configured ? "/auth/google" : undefined}
          aria-disabled={!configured}
        >
          <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.42 38.08 46.98 31.93 46.98 24.55Z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
          </svg>
          Continuar con Google
        </a>
        <p className="auth-footnote">Acceso privado para dos personas.</p>
      </section>
    </main>
  );
}
