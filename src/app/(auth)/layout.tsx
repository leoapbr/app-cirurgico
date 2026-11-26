import { DemoBanner } from "@/components/demo-banner";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <DemoBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <p className="mb-6 text-center text-sm font-semibold tracking-wide text-primary">App Cirúrgico</p>
          {children}
        </div>
      </main>
    </>
  );
}
