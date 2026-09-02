import {
  PRODUCT_MARKETING_POLICY,
  ensureMarketingDocumentationPlan,
  isMandatoryMarketingTask,
  validateMarketingDocumentationPlan,
} from "./dataMarketing";
import { validateProjectPlanReviewTopology } from "./planTopology";
import type { ProjectPlan, ProjectTaskPlan } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function basePlan(tasks?: ProjectTaskPlan[]): ProjectPlan {
  return {
    projectName: "Test Product",
    repositoryName: "test-product",
    productSummary: "A production product used to verify the marketing pipeline.",
    architectureSummary: "Test architecture",
    needsAuth: false,
    technologyDecisions: [],
    tasks: tasks ?? [
      {
        id: "DEV-001",
        title: "Implement product",
        role: "frontend",
        taskSlug: "implement-product",
        summary: "Implement the user-facing product.",
        dependsOn: [],
        acceptanceCriteria: ["Product renders"],
      },
      {
        id: "CR-001",
        title: "Review product",
        role: "code-review",
        taskSlug: "review-product",
        summary: "Review implementation.",
        dependsOn: ["DEV-001"],
        acceptanceCriteria: ["Diff reviewed"],
      },
      {
        id: "REV-001",
        title: "Review requirements",
        role: "reviewer",
        taskSlug: "review-requirements",
        summary: "Review product requirements.",
        dependsOn: ["CR-001"],
        acceptanceCriteria: ["Requirements reviewed"],
      },
      {
        id: "QA-001",
        title: "QA product",
        role: "qa",
        taskSlug: "qa-product",
        summary: "Verify the product.",
        dependsOn: ["REV-001"],
        acceptanceCriteria: ["QA complete"],
      },
    ],
  };
}

function run() {
  {
    const plan = ensureMarketingDocumentationPlan(basePlan());
    assert(plan.tasks.length === 9, "marketing policy must append exactly five governance tasks");

    const marketing = plan.tasks.find((task) => task.role === "data-marketing");
    const documentation = plan.tasks.find(
      (task) => task.role === "documentation" && task.dependsOn.includes(marketing?.id ?? ""),
    );
    const codeReview = plan.tasks.find(
      (task) => task.role === "code-review"
        && marketing
        && documentation
        && task.dependsOn.includes(marketing.id)
        && task.dependsOn.includes(documentation.id),
    );
    const reviewer = plan.tasks.find(
      (task) => task.role === "reviewer" && codeReview && task.dependsOn.includes(codeReview.id),
    );
    const qa = plan.tasks.find(
      (task) => task.role === "qa" && reviewer && task.dependsOn.includes(reviewer.id),
    );

    assert(Boolean(marketing), "Data & Marketing task must exist");
    assert(Boolean(documentation), "Documentation task must depend on marketing output");
    assert(Boolean(codeReview), "Code Review must inspect both marketing and documentation outputs");
    assert(Boolean(reviewer), "Reviewer must follow marketing Code Review");
    assert(Boolean(qa), "QA must close the marketing documentation verification chain");
    assert(
      marketing?.summary.includes(PRODUCT_MARKETING_POLICY.analysisPath) ?? false,
      "Data & Marketing task must own the evidence analysis document",
    );
    assert(
      documentation?.summary.includes(PRODUCT_MARKETING_POLICY.documentPath) ?? false,
      "Documentation task must own the final go-to-market document",
    );

    const governanceTasks = [marketing, documentation, codeReview, reviewer, qa]
      .filter((task): task is ProjectTaskPlan => Boolean(task));
    assert(
      governanceTasks.length === 5 && governanceTasks.every(isMandatoryMarketingTask),
      "all five injected marketing governance tasks must be protected during replanning",
    );

    validateMarketingDocumentationPlan(plan);
    validateProjectPlanReviewTopology(plan);

    const secondPass = ensureMarketingDocumentationPlan(plan);
    assert(
      secondPass.tasks.filter((task) => task.role === "data-marketing").length === 1,
      "marketing injection must be idempotent",
    );
  }

  {
    const partialPlan = basePlan([
      ...basePlan().tasks,
      {
        id: "BLOOM-421",
        title: "Analyze product marketing",
        role: "data-marketing",
        taskSlug: "product-marketing-strategy",
        summary: `Write ${PRODUCT_MARKETING_POLICY.analysisPath}.`,
        dependsOn: ["DEV-001"],
        acceptanceCriteria: ["Marketing analysis recorded"],
      },
    ]);
    const repaired = ensureMarketingDocumentationPlan(partialPlan);
    const marketing = repaired.tasks.filter((task) => task.role === "data-marketing");
    const documentation = repaired.tasks.find(
      (task) => task.role === "documentation" && task.dependsOn.includes("BLOOM-421"),
    );

    assert(marketing.length === 1, "existing Data & Marketing task must be preserved without duplication");
    assert(Boolean(documentation), "missing Documentation chain must be repaired after an existing marketing task");
    validateMarketingDocumentationPlan(repaired);
    validateProjectPlanReviewTopology(repaired);
  }

  {
    let threw = false;
    try {
      validateMarketingDocumentationPlan(basePlan());
    } catch {
      threw = true;
    }
    assert(threw, "plans without Data & Marketing must fail the marketing policy gate");
  }

  {
    const manyTasks: ProjectTaskPlan[] = Array.from({ length: 36 }, (_, index) => ({
      id: `TASK-${String(index + 1).padStart(3, "0")}`,
      title: `Task ${index + 1}`,
      role: "idea",
      taskSlug: `task-${index + 1}`,
      summary: "Planning task",
      dependsOn: index === 0 ? [] : [`TASK-${String(index).padStart(3, "0")}`],
      acceptanceCriteria: ["Recorded"],
    }));
    let threw = false;
    try {
      ensureMarketingDocumentationPlan(basePlan(manyTasks));
    } catch {
      threw = true;
    }
    assert(threw, "plans over 35 PM tasks must not silently exceed the 40-task runtime limit");
  }

  console.log("PASS  Luna mandatory data marketing pipeline scenarios passed.");
}

run();
