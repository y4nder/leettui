import { useEffect } from "react";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "./ui/store";
import { BrowseView } from "./views/browse/BrowseView";
import { ProblemView } from "./views/problem/ProblemView";

interface AppProps {
  renderer: Awaited<ReturnType<typeof createCliRenderer>>;
}

export function App({ renderer }: AppProps) {
  const mode = useAppStore((s) => s.mode);

  useEffect(() => {
    useAppStore.getState().init();
  }, []);

  if (mode === "problem") {
    return <ProblemView renderer={renderer} />;
  }
  return <BrowseView renderer={renderer} />;
}
