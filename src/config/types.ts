export interface Config {
  csrftoken: string;
  lc_session: string;
  editor?: {
    command?: string;
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
}
