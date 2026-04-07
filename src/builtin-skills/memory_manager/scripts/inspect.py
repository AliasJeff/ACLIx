#!/usr/bin/env python3

import json
import os
import sqlite3
import sys
from typing import Any, Dict, List


def _load_messages_from_db(db_path: str, cwd: str) -> List[Dict[str, Any]]:
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT messages FROM sessions WHERE cwd = ?", (cwd,))
        row = cur.fetchone()
        if not row or row[0] is None:
            return []
        raw = row[0]
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    finally:
        conn.close()


def _compressed_memory_present(messages: List[Dict[str, Any]]) -> bool:
    if len(messages) == 0:
        return False
    first = messages[0]
    if not isinstance(first, dict):
        return False
    if first.get("role") != "assistant":
        return False
    content = first.get("content")
    return isinstance(content, str) and "[Historical Context Summary]" in content


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: inspect.py <cwd>\n")
        return 2

    cwd = sys.argv[1]
    home = os.path.expanduser("~")
    db_path = os.path.join(home, ".aclix", "acli.db")

    messages = _load_messages_from_db(db_path, cwd)
    cm_present = _compressed_memory_present(messages)
    message_count = len(messages)
    stm_count = message_count - (1 if cm_present else 0)
    if stm_count < 0:
        stm_count = 0

    out: Dict[str, Any] = {
        "cwd": cwd,
        "dbPath": db_path,
        "messageCount": message_count,
        "compressedMemoryPresent": cm_present,
        "shortTermMessageCount": stm_count,
    }

    sys.stdout.write(json.dumps(out))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

