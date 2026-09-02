from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise RuntimeError(f"missing marker: {old[:100]}")
    return text.replace(old, new, 1)


rel = "bloom-runtime/ts/lunaProductionDelivery.ts"
text = read(rel)
if 'import { writeLunaReviewPackage } from "./lunaReviewPackage";' not in text:
    text = replace_once(
        text,
        'import { automateLunaDelivery } from "./lunaDeliveryAutomation";\n',
        'import { automateLunaDelivery } from "./lunaDeliveryAutomation";\nimport { writeLunaReviewPackage } from "./lunaReviewPackage";\n',
    )
old = '    return { publicUrl: result.delivery.publicUrl };'
new = '''    const reviewPackage = await writeLunaReviewPackage(input.workspacePath, {
      projectName: input.projectName,
      projectSlug: input.slug,
      repositoryFullName: input.repositoryFullName,
      commitSha: input.mainSha,
      publicUrl: result.delivery.publicUrl,
      requiresAuth: input.requiresAuth,
    });

    return {
      publicUrl: result.delivery.publicUrl,
      reviewPackagePath: reviewPackage.path,
    };'''
text = replace_once(text, old, new)
write(rel, text)

rel = "bloom-runtime/ts/observedHeadlessBuilderExecutor.ts"
text = read(rel)
text = replace_once(
    text,
    ') => Promise<{ publicUrl: string }>;',
    ') => Promise<{ publicUrl: string; reviewPackagePath?: string }>;',
)
write(rel, text)

for rel in ["bloom-runtime/tsconfig.worker.json", "bloom-runtime/tsconfig.policy-tests.json"]:
    data = json.loads(read(rel))
    include = data.setdefault("include", [])
    for item in ["ts/lunaReviewPackage.ts"]:
        if item not in include:
            include.append(item)
    if rel.endswith("tsconfig.policy-tests.json") and "ts/lunaReviewPackage.policy-test.ts" not in include:
        include.append("ts/lunaReviewPackage.policy-test.ts")
    if rel.endswith("tsconfig.policy-tests.json"):
        for item in ["ts/bloomLocalAgentRuntime.policy-test.ts", "ts/codexFreeRuntime.policy-test.ts"]:
            if item not in include:
                include.append(item)
    write(rel, json.dumps(data, ensure_ascii=False, indent=2) + "\n")

print("Luna review package migration applied")
