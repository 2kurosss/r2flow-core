"""Executor-плагин python: насадка на воркер. Только пример манифеста."""

PLUGIN = {
    "kind": "executor",
    "name": "python",
    "capabilities": ["python:3.11"],
    "run": "python main.py",
}
