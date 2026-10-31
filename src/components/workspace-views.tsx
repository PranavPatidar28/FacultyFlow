"use client";
import { useEffect, useState, type ComponentType } from "react";
import type { AppData } from "@/lib/types";
import type { RunAction } from "./ui/workspace-ui";
import { ViewSkeleton } from "./ui/view-skeleton";
import { Button } from "./ui/button";
type ViewProps = { data: AppData; run: RunAction; busy: boolean };
type ViewComponent = ComponentType<ViewProps>;
// Cache code, never workspace data or identity. Loading without a new Suspense
// boundary avoids delaying a completed import during route transitions.
const components = new Map<string, ViewComponent>();
export async function preloadView(
  view: string,
): Promise<ViewComponent | undefined> {
  const cached = components.get(view);
  if (cached) return cached;
  let Component: ViewComponent | undefined;
  if (view === "timetable")
    Component = (await import("./views/timetable")).TimetableView;
  else if (view === "changes" || view === "substitutions")
    Component = (await import("./views/change-desk")).ChangeDesk;
  else if (view === "inbox")
    Component = (await import("./views/coverage")).InboxView;
  else if (
    ["faculty", "academics", "availability", "settings"].includes(view)
  ) {
    const setupViews = await import("./views/setup");
    Component = {
      faculty: setupViews.FacultyView,
      academics: setupViews.AcademicsView,
      availability: setupViews.AvailabilityView,
      settings: setupViews.SettingsView,
    }[view];
  }
  if (Component) components.set(view, Component);
  return Component;
}
export function WorkspaceView({
  view,
  ...props
}: ViewProps & { view: string }) {
  const [state, setState] = useState<{
    Component?: ViewComponent;
    error: string;
  }>(() => ({ Component: components.get(view), error: "" }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    preloadView(view)
      .then((Component) => {
        if (active)
          setState({
            Component,
            error: Component ? "" : "This screen could not be loaded.",
          });
      })
      .catch(() => {
        if (active)
          setState({
            error:
              "This screen could not be loaded. Check your connection and try again.",
          });
      });
    return () => {
      active = false;
    };
  }, [view, attempt]);
  const Component = state.Component;
  if (Component) return <Component {...props} />;
  if (state.error)
    return (
      <div className="error-box" role="alert">
        <p>{state.error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setState({ error: "" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  return <ViewSkeleton />;
}
