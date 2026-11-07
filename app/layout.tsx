import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mesa · Planifica con calma",
  description: "Planificador de comidas y compra",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
