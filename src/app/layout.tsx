import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "App Cirúrgico", template: "%s · App Cirúrgico" },
  description: "Planejamento e coordenação de equipes cirúrgicas (protótipo com dados fictícios).",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
