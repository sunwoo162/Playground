from pathlib import Path

path = Path('bloom-runtime/ts/headlessBuilderExecutor.ts')
text = path.read_text(encoding='utf-8')

helper = '''const NON_BLOCKING_MISSING_INPUT_SENTINELS = new Set([\n  "none",\n  "n/a",\n  "not applicable",\n  "없음",\n]);\n\nexport function normalizeBlockingMissingInputs(items: string[]): string[] {\n  return items\n    .map((item) => item.trim())\n    .filter((item) => item.length > 0 && !NON_BLOCKING_MISSING_INPUT_SENTINELS.has(item.toLowerCase()));\n}\n\n'''

needle = 'function initialTaskRun(task: ProjectTaskPlan, teamId: TeamId): ProjectTaskRun {'
if 'export function normalizeBlockingMissingInputs' not in text:
    if needle not in text:
        raise SystemExit('helper insertion point not found')
    text = text.replace(needle, helper + needle, 1)

old = '      const missingInputs = intake.analysis.missingInputs.map((item) => item.trim()).filter(Boolean);'
new = '      const missingInputs = normalizeBlockingMissingInputs(intake.analysis.missingInputs);'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('missingInputs normalization callsite not found')

path.write_text(text, encoding='utf-8')
print('Applied Intake none-sentinel normalization')
