"""Start finite audio only after the private-call handshake has completed."""
import asyncio


async def maintain_call_updates(client, stopped, notify, interval=5):
    """Keep the caller's connection subscribed; never requests/repeats a call."""
    while not stopped.is_set():
        try:
            await asyncio.wait_for(client.set_receive_updates(True), timeout=10)
            notify('registered')
        except Exception as error:
            notify(type(error).__name__)
        try:
            await asyncio.wait_for(stopped.wait(), timeout=interval)
        except TimeoutError:
            pass


async def play_after_connection(calls, recipient, waiting_stream, speech_stream, config, duration, connected):
    # Keep outbound frames available during ICE/DTLS negotiation. A finite
    # speech source must not be exhausted while the recipient is answering.
    await asyncio.wait_for(calls.play(recipient, waiting_stream, config), timeout=65)
    connected()
    await calls.play(recipient, speech_stream, config)
    await calls.unmute(recipient)
    await calls.resume(recipient)
    await asyncio.sleep(duration + 1)
