// ============================================================================
// app/layout.tsx
// Layout racine de l'app Next.js de l'Agent de Sécurité ti-lex
// ============================================================================
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ti-lex · Agent de Sécurité Défensive",
  description:
    "Agent de cybersécurité défensive ti-lex — conforme Loi 25, autorisation SOW requise.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
