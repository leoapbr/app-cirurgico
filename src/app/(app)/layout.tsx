import { DemoBanner } from "@/components/demo-banner";
import { requireContext } from "@/lib/auth/dal";
import { AppHeader } from "./header";

// Área autenticada: sempre renderizada por requisição, nunca em cache compartilhado.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireContext();
  return (
    <>
      <DemoBanner />
      <AppHeader ctx={ctx} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
