from pathlib import Path

root = Path("scripts")
for path in sorted(root.rglob("*.sh")):
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace("\r\n", "\n").replace("\r", "\n"), encoding="utf-8", newline="\n")
    print(path)
