import { describe, expect, test } from "bun:test";
import type { DbQuestion } from "../../../db/questions";
import { useAppStore } from "../index";

// Exercises the panel-scoped search routing without touching the DB: the questions
// branch projects over the seeded `allQuestions` (pure), and the topic empty-needle
// branch only restores `allTopics` (the non-empty topic branch would hit loadTopic →
// getDb(), so it's left to the interactive pass).

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

const QS = [q(1, "Two Sum"), q(2, "Add Two Numbers"), q(3, "Longest Substring")];

describe("searchSlice routing (panel-scoped)", () => {
  test("question search filters questions and resets the question cursor", () => {
    useAppStore.setState({
      focusedPanel: "questions",
      allQuestions: QS,
      filteredQuestions: QS,
      difficultyFilter: "all",
      searchNeedle: "",
      selectedQuestionIndex: 2,
    });

    useAppStore.getState().updateSearch("two");
    const s = useAppStore.getState();

    expect(s.searchNeedle).toBe("two");
    expect(s.selectedQuestionIndex).toBe(0);
    const titles = s.filteredQuestions.map((x) => x.title);
    expect(titles).toContain("Two Sum");
    expect(titles).toContain("Add Two Numbers");
    expect(titles).not.toContain("Longest Substring");
  });

  test("clearing the question needle restores the full list", () => {
    useAppStore.setState({
      focusedPanel: "questions",
      allQuestions: QS,
      difficultyFilter: "all",
      searchNeedle: "two",
    });

    useAppStore.getState().updateSearch("");
    expect(useAppStore.getState().filteredQuestions).toHaveLength(QS.length);
  });

  test("empty topic needle restores allTopics and preserves the highlighted topic", () => {
    useAppStore.setState({
      focusedPanel: "topics",
      allTopics: ["all", "array", "tree"],
      topics: ["array"], // a previously-filtered list
      selectedTopicIndex: 0,
      topicNeedle: "arr",
    });

    useAppStore.getState().updateSearch("");
    const s = useAppStore.getState();

    expect(s.topicNeedle).toBe("");
    expect(s.topics).toEqual(["all", "array", "tree"]);
    // "array" stays highlighted (remapped into allTopics), not jumped to "all".
    expect(s.allTopics[s.selectedTopicIndex]).toBe("array");
  });
});
