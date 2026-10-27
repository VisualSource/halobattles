import { createRootRoute, Outlet } from "@tanstack/react-router";
import { rootContext } from "../session";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => rootContext(location.pathname),
  component: () => (
    <>
      <div className="flex min-h-screen flex-col max-lg:hidden">
        <header className="border-line border-b bg-bar px-8 py-4">
          <h1 className="font-bold font-display text-xl tracking-[0.12em]">
            HALO BATTLES
          </h1>
        </header>
        <main className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <TooSmall />
    </>
  ),
});

// Phones and narrow windows aren't supported; lg is 1024px.
function TooSmall() {
  return (
    <div className="flex min-h-screen flex-col justify-center gap-3 p-6 lg:hidden">
      <h1 className="font-bold font-display text-3xl">
        This screen is too small
      </h1>
      <p className="text-ink-2 leading-relaxed">
        Halo Battles needs a window at least 1024 pixels wide. Open it on a
        desktop or laptop, or widen your browser window.
      </p>
    </div>
  );
}
