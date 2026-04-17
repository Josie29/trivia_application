# tests/test_transcription_fanout.py
"""Unit tests for TranscriptionFanout (shared SSE broadcast)."""
from transcription_fanout import TranscriptionFanout


class TestTranscriptionFanout:
    """Verify each subscriber receives the same payloads."""

    def test_publish_delivers_to_all_subscribers(self) -> None:
        """Each connected subscriber queue receives a copy of every publish."""
        fanout = TranscriptionFanout(history_maxlen=50)
        q1, snap1 = fanout.subscribe()
        q2, snap2 = fanout.subscribe()
        assert snap1 == []
        assert snap2 == []

        fanout.publish('{"text":"hello"}')

        assert q1.get(timeout=2) == '{"text":"hello"}'
        assert q2.get(timeout=2) == '{"text":"hello"}'

        fanout.unsubscribe(q1)
        fanout.unsubscribe(q2)

    def test_subscribe_replays_history(self) -> None:
        """Late subscriber gets prior payloads in the snapshot list."""
        fanout = TranscriptionFanout(history_maxlen=50)
        fanout.publish('{"text":"a"}')
        fanout.publish('{"text":"b"}')

        q, snapshot = fanout.subscribe()
        assert snapshot == ['{"text":"a"}', '{"text":"b"}']

        fanout.publish('{"text":"c"}')
        assert q.get(timeout=2) == '{"text":"c"}'

        fanout.unsubscribe(q)

    def test_publish_stop_delivers_sentinel(self) -> None:
        """Stop sentinel is delivered on the live queue after replay."""
        sentinel = object()
        fanout = TranscriptionFanout()
        q, _ = fanout.subscribe()
        fanout.publish_stop(sentinel)
        assert q.get(timeout=2) is sentinel
        fanout.unsubscribe(q)
