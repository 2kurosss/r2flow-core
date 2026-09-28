"""Trigger-плагин webhook: POST /hooks/{id} -> создать run/item. Пример."""

PLUGIN = {
    "kind": "trigger",
    "name": "webhook",
    "route": "POST /hooks/{id}",
    "emits": ["run.created", "queue.item.created"],
}
