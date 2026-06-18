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
    // Ctrl+d/Ctrl+u jump distance as a fraction of the visible list height
    // (0 < x ≤ 1). 0.5 = half page (default), 1.0 = full page.
    page_fraction?: number;
  };
}
