import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ViewTransition } from "react";
import { RingBackdrop, useHeaderWanted, useRingWanted } from "../backdrop";
import { rootContext } from "../session";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => rootContext(location.pathname),
  component: function Root() {
    const ring = useRingWanted();
    const header = useHeaderWanted();
    return (
      <>
        <div className="isolate flex min-h-screen flex-col max-lg:hidden">
          {ring && <RingBackdrop />}
          {header && (
            <header
              className={`border-b px-8 py-4 ${ring ? "border-line/70 bg-bar/55 backdrop-blur-md" : "border-line bg-bar"}`}
            >
              <h1 className="font-bold font-display text-xl tracking-[0.12em]">
                HALO BATTLES
              </h1>
            </header>
          )}
          <main className="flex flex-1 flex-col">
            {/* The router navigates in a React transition, so every page
                change (menu, lobby, play, results) cross-fades. */}
            <ViewTransition>
              <Outlet />
            </ViewTransition>
          </main>
        </div>
        <TooSmall />
      </>
    );
  },
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
