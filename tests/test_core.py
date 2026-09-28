from r2flow_core import __version__
from r2flow_core.models import QueueItemStatus


def test_version():
    assert __version__ == "0.1.0"


def test_queue_terminal_statuses():
    assert QueueItemStatus.SUCCESS.value == "success"
    assert QueueItemStatus.SYSTEM_FAILED.value == "system_failed"
