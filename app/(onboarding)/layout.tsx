import Link from "next/link";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col bg-muted/20">
      <header className="px-6 h-14 flex items-center">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-primary"
        >
          Smartclaz
        </Link>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        {children}
      </main>
    </div>
  );
}
