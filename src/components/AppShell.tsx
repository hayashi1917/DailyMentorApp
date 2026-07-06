import BottomNav from "@/components/BottomNav";

export default function AppShell({
  title,
  children,
  calm = false,
}: {
  title?: string;
  children: React.ReactNode;
  /** Recovery Mode等で、落ち着いたトーンの背景にする */
  calm?: boolean;
}) {
  return (
    <div className={calm ? "min-h-dvh bg-brand-50" : "min-h-dvh"}>
      {title && (
        <header className="px-5 pt-6 pb-2">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </header>
      )}
      <main className="px-5 pb-28 pt-2">{children}</main>
      <BottomNav />
    </div>
  );
}
