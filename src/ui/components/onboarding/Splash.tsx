import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTimeline } from "@opentui/react";

import { Logo } from "./Logo";
import { colors } from "../../theme";
import { VERSION } from "../../../core/version";

interface SplashProps {
  /** Called once when the splash finishes (timer elapsed or a key was pressed). */
  onDone: () => void;
}

// Brief animated logo shown on every launch. The mark wipes in left-to-right, then
// the splash auto-advances. Any keypress skips straight ahead.
export function Splash({ onDone }: SplashProps) {
  const [reveal, setReveal] = useState(0);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const timeline = useTimeline({ duration: 950, loop: false, onComplete: finish });

  useEffect(() => {
    timeline.add(
      { r: 0 },
      {
        r: 1,
        duration: 650,
        ease: "linear",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUpdate: (a: any) => setReveal(a.targets[0].r),
      },
    );
    // timeline identity is stable for the component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeyboard(() => finish());

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={colors.bg}
    >
      <Logo reveal={reveal} />
      <box height={1} />
      <text fg={colors.fgDim}>
        {reveal >= 1 ? `${VERSION}  ·  press any key to continue` : ""}
      </text>
    </box>
  );
}
