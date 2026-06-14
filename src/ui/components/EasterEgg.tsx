import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTimeline } from "@opentui/react";

import { Logo } from "./onboarding/Logo";
import { colors } from "../theme";
import { useAppStore } from "../store";
import { VERSION } from "../../core/version";

// Command-palette easter egg ("✦ Reveal the leettui logo"). A full-screen ASCII
// reveal that lingers until any key is pressed. No keymap bindings are mounted in
// `easterEgg` mode, so dismissal is handled directly via `useKeyboard` — any key
// returns to browse.
export function EasterEgg() {
  const [reveal, setReveal] = useState(0);
  const dismissed = useRef(false);

  const timeline = useTimeline({ duration: 600, loop: false });
  useEffect(() => {
    timeline.add(
      { r: 0 },
      {
        r: 1,
        duration: 550,
        ease: "linear",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUpdate: (a: any) => setReveal(a.targets[0].r),
      },
    );
    // timeline identity is stable for the component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeyboard(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    useAppStore.getState().hideEasterEgg();
  });

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={colors.bg}
    >
      <Logo reveal={reveal} subtitle="✦ you found a little secret ✦" />
      <box height={1} />
      <text fg={colors.fgDim}>{reveal >= 1 ? `${VERSION}  ·  press any key to return` : ""}</text>
    </box>
  );
}
