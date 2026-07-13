export interface Config {
  csrftoken: string;
  lc_session: string;
  editor?: {
    command?: string;
    // "auto" (default): GUI editors launch detached (TUI stays live), terminal
    // editors suspend the TUI; true/false forces either behavior.
    detach?: "auto" | boolean;
  };
  git?: {
    ui?: string;
  };
  paths?: {
    db?: string;
    solutions?: string;
  };
  language?: {
    default?: string;
  };
  theme?: {
    name?: string;
  };
  scroll?: {
    // Ctrl+d/Ctrl+u jump distance, in rows (a positive integer). Default 10.
    jump_rows?: number;
  };
  update?: {
    // Background auto-update (default true): download new releases and install
    // them in place; the banner then says "restart to apply". false = only
    // show the "update available" banner.
    auto?: boolean;
  };
}
