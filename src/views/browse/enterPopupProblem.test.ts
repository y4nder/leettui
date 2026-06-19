import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { DbQuestion } from "../../db/questions";

// Capture the problem-view entry so the handler can be exercised without a
// network fetch (handleEnterProblemView would otherwise hit the LeetCode API).
const enterCalls: DbQuestion[] = [];
mock.module("../problem/handlers", () => ({
  handleEnterProblemView: (q: DbQuestion) => {
    enterCalls.push(q);
    return Promise.resolve();
  },
}));

// Imported after the mock is registered so the handler picks up the stub.
let useAppStore: typeof import("../../ui/store").useAppStore;
let handleEnterPopupProblem: typeof import("./handlers").handleEnterPopupProblem;

function q(id: number, title: string): DbQuestion {
  return {
    id,
    title,
    title_slug: title.toLowerCase().replace(/\s+/g, "-"),
    difficulty: "Easy",
    paid_only: 0,
    status: null,
    ac_rate: 50,
    last_runtime: null,
    last_memory: null,
  } as DbQuestion;
}

beforeAll(async () => {
  ({ useAppStore } = await import("../../ui/store"));
  ({ handleEnterPopupProblem } = await import("./handlers"));
});

beforeEach(() => {
  enterCalls.length = 0;
});

describe("handleEnterPopupProblem (daily popup Enter)", () => {
  test("a synced daily question closes the popup and opens the problem view", () => {
    const daily = q(42, "Trapping Rain Water");
    useAppStore.getState().showPopup("42. Trapping Rain Water — Daily", "body", daily);
    expect(useAppStore.getState().mode).toBe("popup");

    handleEnterPopupProblem();

    // popup closed (read-before-clear: popupQuestion is consumed before hidePopup),
    // and the entry handler received that exact question.
    expect(useAppStore.getState().popupQuestion).toBeNull();
    expect(enterCalls).toHaveLength(1);
    expect(enterCalls[0]?.id).toBe(42);
  });

  test("an unsynced daily question (no DB row) surfaces a sync-first info message", () => {
    useAppStore.getState().showPopup("999. Brand New — Daily", "body", null);

    handleEnterPopupProblem();

    expect(enterCalls).toHaveLength(0);
    const s = useAppStore.getState();
    expect(s.popupQuestion).toBeNull();
    expect(s.mode).toBe("result");
    expect(s.resultView?.kind).toBe("info");
  });
});
