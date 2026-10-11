import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from telegram_call_audio import play_after_connection, maintain_call_updates


class AudioSequenceTest(unittest.IsolatedAsyncioTestCase):
    async def test_update_registration_ends_with_call_without_dialing(self):
        client = type('Client', (), {})()
        client.set_receive_updates = AsyncMock()
        stopped = asyncio.Event()
        events = []
        def notify(status):
            events.append(status)
            if len(events) == 2:
                stopped.set()
        await maintain_call_updates(client, stopped, notify, interval=0.001)
        self.assertEqual(events, ['registered', 'registered'])
        self.assertEqual(client.set_receive_updates.await_count, 2)

    async def test_speech_starts_only_after_connection_and_is_unmuted(self):
        calls = type('Calls', (), {})()
        events = []
        async def play(recipient, stream, config):
            events.append(stream)
            if stream == 'speech':
                self.assertIn('connected', events)
        calls.play = play
        calls.unmute = AsyncMock()
        calls.resume = AsyncMock()
        with patch('telegram_call_audio.asyncio.sleep', new_callable=AsyncMock) as sleep:
            await play_after_connection(calls, 123, 'silence', 'speech', object(), 19, lambda: events.append('connected'))
        self.assertEqual(events, ['silence', 'connected', 'speech'])
        calls.unmute.assert_awaited_once_with(123)
        calls.resume.assert_awaited_once_with(123)
        sleep.assert_awaited_once_with(20)

    async def test_failed_connection_never_starts_speech(self):
        calls = type('Calls', (), {})()
        calls.play = AsyncMock(side_effect=TimeoutError())
        calls.unmute = AsyncMock()
        calls.resume = AsyncMock()
        with self.assertRaises(TimeoutError):
            await play_after_connection(calls, 123, 'silence', 'speech', object(), 19, lambda: self.fail('Connected on timeout'))
        self.assertEqual(calls.play.await_count, 1)
        calls.unmute.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
