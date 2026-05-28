import { useEffect } from "react";
import type { createCliRenderer } from "@opentui/core";

import { useAppStore } from "./ui/store";
import { BrowseView } from "./views/browse/BrowseView";

interface AppProps {
  renderer: Awaited<ReturnType<typeof createCliRenderer>>;
}

export function App({ renderer }: AppProps) {
  useEffect(() => {
    useAppStore.getState().init();
  }, []);

  return <BrowseView renderer={renderer} />;
}
