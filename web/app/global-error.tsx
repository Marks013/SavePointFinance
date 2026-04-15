"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { captureUnexpectedError } from "@/lib/observability/sentry";

type GlobalErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    captureUnexpectedError(error, {
      surface: "global-error",
      route: pathname ?? undefined,
      operation: "render",
      feature: "app-router",
      extra: {
        digest: error.digest ?? null,
        search: searchParams.toString() || null
      }
    });
  }, [error, pathname, searchParams]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          background: "#101828",
          color: "#f8fafc",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px"
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "560px",
              border: "1px solid rgba(148, 163, 184, 0.24)",
              borderRadius: "20px",
              padding: "24px",
              background:
                "linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(15, 23, 42, 0.84) 100%)",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.4)"
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#94a3b8"
              }}
            >
              Monitoramento de erro
            </p>
            <h1
              style={{
                margin: "12px 0 0",
                fontSize: "28px",
                lineHeight: 1.1
              }}
            >
              Ocorreu um erro inesperado.
            </h1>
            <p
              style={{
                margin: "12px 0 0",
                fontSize: "15px",
                lineHeight: 1.6,
                color: "#cbd5e1"
              }}
            >
              A falha foi registrada para analise. Tente novamente e, se persistir, revise os logs do
              Sentry.
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "24px"
              }}
            >
              <button
                onClick={() => reset()}
                style={{
                  appearance: "none",
                  border: 0,
                  borderRadius: "999px",
                  padding: "12px 18px",
                  background: "#f59e0b",
                  color: "#101828",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 700
                }}
                type="button"
              >
                Tentar novamente
              </button>
            </div>
            {error.digest ? (
              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "12px",
                  color: "#94a3b8",
                  wordBreak: "break-word"
                }}
              >
                Referencia: {error.digest}
              </p>
            ) : null}
          </section>
        </main>
      </body>
    </html>
  );
}
