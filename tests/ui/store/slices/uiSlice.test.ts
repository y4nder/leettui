import { describe, expect, test } from "bun:test";
import { useAppStore } from "@/ui/store/index";

// Tests for the dashboard return-mode wiring (D-11 / Pitfall 6):
// showDashboard writes ONLY mode + dashboardReturnMode — it must not touch
// problem state or any other slice. hideDashboard restores dashboardReturnMode.

describe("uiSlice dashboard return-mode", () => {
  test("showDashboard('browse') then hideDashboard() returns to browse", () => {
    const store = useAppStore.getState();
    // Reset to known state
    store.setMode("browse");

    store.showDashboard("browse");
    expect(useAppStore.getState().mode).toBe("dashboard");
    expect(useAppStore.getState().dashboardReturnMode).toBe("browse");

    store.hideDashboard();
    expect(useAppStore.getState().mode).toBe("browse");
  });

  test("showDashboard('problem') then hideDashboard() returns to problem", () => {
    const store = useAppStore.getState();
    // Simulate being in problem mode
    store.setMode("problem");

    store.showDashboard("problem");
    expect(useAppStore.getState().mode).toBe("dashboard");
    expect(useAppStore.getState().dashboardReturnMode).toBe("problem");

    store.hideDashboard();
    expect(useAppStore.getState().mode).toBe("problem");
  });

  test("showDashboard does NOT clear problem state (D-11)", () => {
    const store = useAppStore.getState();
    // Read problem state before opening dashboard
    const problemBefore = useAppStore.getState().problem;

    store.showDashboard("problem");

    // problem state must be identical — showDashboard must write nothing to it
    expect(useAppStore.getState().problem).toBe(problemBefore);

    // Cleanup
    store.hideDashboard();
  });

  test("showDashboard sets dashboardReturnMode to the passed mode", () => {
    const store = useAppStore.getState();
    store.showDashboard("browse");
    expect(useAppStore.getState().dashboardReturnMode).toBe("browse");
    store.showDashboard("problem");
    expect(useAppStore.getState().dashboardReturnMode).toBe("problem");
    // Cleanup
    store.hideDashboard();
  });
});

// The two update-banner stages: "available" (a newer tag exists) and
// "installed" (the background auto-update already swapped the binary). Setting
// installed supersedes available; clearing installed touches only itself.
describe("uiSlice update banner stages", () => {
  test("setUpdateInstalled supersedes the available banner", () => {
    const store = useAppStore.getState();
    store.setUpdateAvailable("v1.0.0");
    store.setUpdateInstalled("v1.0.0");
    expect(useAppStore.getState().updateInstalled).toBe("v1.0.0");
    expect(useAppStore.getState().updateAvailable).toBeNull();
    // Cleanup
    store.setUpdateInstalled(null);
  });

  test("setUpdateInstalled(null) clears only itself", () => {
    const store = useAppStore.getState();
    store.setUpdateInstalled("v1.0.0");
    store.setUpdateAvailable("v1.1.0");
    store.setUpdateInstalled(null);
    expect(useAppStore.getState().updateInstalled).toBeNull();
    expect(useAppStore.getState().updateAvailable).toBe("v1.1.0");
    // Cleanup
    store.setUpdateAvailable(null);
  });
});
