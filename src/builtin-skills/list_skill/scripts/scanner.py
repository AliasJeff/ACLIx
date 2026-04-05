#!/usr/bin/env python3
"""Scan ACLIx skill directories for SKILL.md files and emit a JSON summary."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path


def default_scan_roots() -> list[str]:
    home = Path.home()
    return [
        os.path.abspath(os.path.expanduser(str(home / ".aclix" / "skills"))),
        os.path.abspath(os.path.join(os.getcwd(), ".aclix", "skills")),
    ]


def iter_skill_md_files(root: str):
    root = os.path.abspath(os.path.expanduser(root))
    if not os.path.isdir(root):
        return
    skip_dir_names = frozenset({".git", "node_modules", "__pycache__"})
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        dirnames[:] = [d for d in dirnames if d not in skip_dir_names and not d.startswith(".")]
        if "SKILL.md" in filenames:
            yield os.path.join(dirpath, "SKILL.md")


def read_frontmatter_name_description(path: str) -> tuple[str | None, str | None]:
    try:
        with open(path, encoding="utf-8") as handle:
            content = handle.read()
    except OSError:
        return None, None
    match = re.match(r"^---\s*\r?\n([\s\S]*?)\r?\n---", content)
    if not match:
        return None, None
    block = match.group(1)
    name: str | None = None
    description: str | None = None
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if line.startswith("name:"):
            name = line.split(":", 1)[1].strip().strip("\"'")
        elif line.startswith("description:"):
            description = line.split(":", 1)[1].strip().strip("\"'")
    return name, description


def build_record(skill_md_path: str) -> dict[str, str | None]:
    abs_md = os.path.abspath(skill_md_path)
    skill_dir = os.path.dirname(abs_md)
    folder_name = os.path.basename(skill_dir)
    fm_name, fm_description = read_frontmatter_name_description(abs_md)
    return {
        "folder_name": folder_name,
        "skill_directory": skill_dir,
        "skill_md_path": abs_md,
        "name": fm_name,
        "description": fm_description,
    }


def main() -> None:
    roots = [sys.argv[1]] if len(sys.argv) >= 2 else default_scan_roots()

    seen: set[str] = set()
    skills: list[dict[str, str | None]] = []
    for root in roots:
        for md_path in iter_skill_md_files(root):
            key = os.path.realpath(md_path)
            if key in seen:
                continue
            seen.add(key)
            skills.append(build_record(md_path))

    skills.sort(key=lambda row: (row["folder_name"] or "").lower())
    result = {"skills": skills}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
