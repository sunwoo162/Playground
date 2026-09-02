from pathlib import Path

path = Path(__file__).resolve().parents[2] / "bloom-runtime/ts/bloomLocalAgentRuntime.ts"
text = path.read_text(encoding="utf-8")
old = '.replaceAll("\\\\", "/")'
new = '.replace(/\\\\/g, "/")'
count = text.count(old)
if count != 3:
    raise RuntimeError(f"expected 3 replaceAll calls, found {count}")
path.write_text(text.replace(old, new), encoding="utf-8")
print("Bloom Local Agent TypeScript compatibility fix applied")
