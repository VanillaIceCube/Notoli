"""Bound CI reviewer context while retaining early, failing and late evidence."""
from pathlib import Path
import re
import sys
import uuid


def summarize(text, limit=16000):
    lines = text.splitlines()
    indexes = set(range(min(20, len(lines))))
    indexes.update(range(max(0, len(lines) - 20), len(lines)))
    failures = [i for i, line in enumerate(lines) if re.search(
        r"not ok|FAIL(?:ED|URE)?|Traceback|AssertionError|^\s*[×✖]|Error:", line
    )]
    # Even many failures get bounded context; sample across the entire run.
    if len(failures) > 12:
        failures = [failures[round(i * (len(failures) - 1) / 11)] for i in range(12)]
    for i in failures:
        indexes.update(range(max(0, i - 1), min(len(lines), i + 4)))
    # Allocate a per-line budget so a huge header cannot remove later failures.
    budget = max(32, (limit - 1000) // max(1, len(indexes)))
    selected = []
    previous = -1
    for i in sorted(indexes):
        if i > previous + 1:
            selected.append("... omitted lines; complete output is in the job log ...")
        selected.append(lines[i][:budget])
        previous = i
    return "\n".join(selected)[:limit]


def main():
    source, output = map(Path, sys.argv[1:3])
    text = source.read_text(encoding="utf-8", errors="replace") if source.exists() else "No check output was produced."
    content = summarize(text)
    delimiter = "LOG_" + uuid.uuid4().hex
    with output.open("a", encoding="utf-8") as stream:
        stream.write(f"log<<{delimiter}\n{content}\n{delimiter}\n")
    # Artifact size is capped; tee retains the complete original in the job log.
    data = text.encode("utf-8")
    cap = 512 * 1024
    if len(data) > 2 * cap:
        data = data[:cap] + b"\n... artifact truncated; complete output is in the job log ...\n" + data[-cap:]
    source.with_suffix(".bounded.txt").write_bytes(data)
    source.with_suffix(".summary.txt").write_text(content, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
