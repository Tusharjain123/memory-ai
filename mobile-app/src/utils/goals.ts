/** Onboarding goals, stored on the profile as "A · B · C". */

export const GOALS = {
  conversations: "Remember conversations",
  commitments: "Stay on top of commitments",
  people: "Prepare for important people",
  ideas: "Capture ideas and reflections",
} as const;

export type GoalKey = keyof typeof GOALS;

export function parseGoals(stored: string | null | undefined): string[] {
  return (stored ?? "").split("·").map((part) => part.trim()).filter(Boolean);
}

export function joinGoals(goals: string[]): string {
  return goals.map((goal) => goal.trim()).filter(Boolean).join(" · ");
}

export function hasGoal(goals: string[], key: GoalKey): boolean {
  return goals.includes(GOALS[key]);
}

/** What Home should lead with, in order, based on what the person said matters. */
export function homePriority(goals: string[]): GoalKey[] {
  const order: GoalKey[] = [];
  if (hasGoal(goals, "commitments")) order.push("commitments");
  if (hasGoal(goals, "people")) order.push("people");
  if (hasGoal(goals, "conversations")) order.push("conversations");
  if (hasGoal(goals, "ideas")) order.push("ideas");
  return order.length ? order : ["conversations"];
}

const CAPTIONS: Record<GoalKey, string> = {
  conversations: "your latest conversations",
  commitments: "the promises you've made",
  people: "who you're meeting next",
  ideas: "your ideas and reflections",
};

/** Sentence shown live in onboarding so the choice visibly changes something. */
export function goalCaption(goals: string[]): string {
  if (!goals.length) return "Pick anything — you can change it later.";
  const leads = homePriority(goals).slice(0, 2).map((key) => CAPTIONS[key]);
  return `Home will lead with ${leads.join(" and ")}.`;
}
