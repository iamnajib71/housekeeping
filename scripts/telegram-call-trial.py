"""Manual private Telegram call trial. Login never places a call.

Use the isolated .local/telegram-call-venv runtime. Credentials, session,
recipient configuration, recording and receipt stay in ignored .local/.env.local.
"""
import argparse
import asyncio
import json
import os
import logging
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from telegram_call_audio import play_after_connection, maintain_call_updates

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env.local')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--login', action='store_true', help='Private interactive account sign-in; no call')
parser.add_argument('--resolve', action='store_true', help='Check the selected private recipient; no call')
parser.add_argument('--call', action='store_true', help='Place the explicitly requested one-off test call')
args = parser.parse_args()


async def main():
    api_id = os.getenv('TELEGRAM_API_ID', '')
    api_hash = os.getenv('TELEGRAM_API_HASH', '')
    if not api_id.isdigit() or len(api_hash) != 32:
        raise RuntimeError('Save TELEGRAM_API_ID and TELEGRAM_API_HASH in .env.local first.')
    from telethon import TelegramClient
    from telethon.tl.functions.contacts import ResolvePhoneRequest, GetContactsRequest
    from telethon.errors import PhoneNotOccupiedError
    from telethon.tl.types import User
    client = TelegramClient(str(ROOT / '.local/telegram-caller'), int(api_id), api_hash,
                            device_model='Housekeeping private call trial')
    await client.connect()
    try:
        if args.login:
            # Run in a private interactive window, never enter codes in chat.
            await client.start(phone=os.getenv('TELEGRAM_CALLER_PHONE') or None)
            print('Caller signed in. No call has been placed.', flush=True)
            return
        if not await client.is_user_authorized():
            raise RuntimeError('Run --login in a private terminal first. No call placed.')
        # A connected socket alone is insufficient: explicitly subscribe to
        # live updates before requesting a private call and waiting for Answer.
        await client.set_receive_updates(True)
        me = await client.get_me()
        if me.bot:
            raise RuntimeError('A normal Telegram user account is required, not a bot.')
        caller_phone = os.getenv('TELEGRAM_CALLER_PHONE', '').lstrip('+')
        if me.phone and caller_phone and me.phone.lstrip('+') != caller_phone:
            raise RuntimeError('Saved caller session belongs to a different phone number. No call placed.')
        config = json.loads((ROOT / '.local/telegram-call-target.json').read_text())
        target = config.get('username')
        if target:
            recipient = await client.get_entity(target)
        elif config.get('userId'):
            # A verified address-book match can resolve contacts whose phone
            # lookup is unavailable. Telethon keeps its access hash privately.
            recipient = await client.get_entity(int(config['userId']))
        else:
            try:
                result = await client(ResolvePhoneRequest(phone=config['phone'].lstrip('+')))
                recipient = next((u for u in result.users if u.id == result.peer.user_id), None)
            except PhoneNotOccupiedError:
                contacts = await client(GetContactsRequest(hash=0))
                matches = [u for u in contacts.users if (u.phone or '').lstrip('+') == config['phone'].lstrip('+')]
                if len(matches) != 1:
                    raise RuntimeError('No unique verified phone match in the caller contacts. No call placed.')
                recipient = matches[0]
        if not isinstance(recipient, User) or recipient.bot or recipient.deleted or recipient.id == me.id:
            raise RuntimeError('Select a different normal user as the private call recipient.')
        expected_phone = config.get('phone', '').lstrip('+')
        if recipient.phone and expected_phone and recipient.phone.lstrip('+') != expected_phone:
            raise RuntimeError('Username phone does not match the selected contact. No call placed.')
        print('Selected recipient resolved: ' + config['name'], flush=True)
        if not args.call:
            print('No call placed. Use --call only for the explicitly requested trial.', flush=True)
            return
        audio = ROOT / '.local/telegram-call-test.pcm'
        duration = audio.stat().st_size / (48000 * 2)
        if not 1 <= duration <= 30:
            raise RuntimeError('The trial must use a 1–30 second, mono 48kHz 16-bit PCM recording.')
        receipt = ROOT / '.local/telegram-call-trial-receipt.json'
        if receipt.exists():
            raise RuntimeError('A trial was already attempted. No automatic repeat call.')
        record = {'caller': me.id, 'recipient': recipient.id, 'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'attempting', 'phoneStates': [], 'mediaStates': [], 'updateRegistrations': 0}
        metadata = ROOT / '.local/telegram-call-audio-metadata.json'
        if metadata.exists():
            generated = json.loads(metadata.read_text())
            if generated.get('sha256') == hashlib.sha256(audio.read_bytes()).hexdigest():
                record['audio'] = generated
        receipt.write_text(json.dumps(record))
        logging.basicConfig(filename=str(ROOT / '.local/telegram-call-errors.log'), level=logging.ERROR)
        from telethon import events
        from telethon.tl.types import UpdatePhoneCall

        async def phone_update(update):
            if isinstance(update, UpdatePhoneCall):
                phone = update.phone_call
                if getattr(phone, 'participant_id', None) == recipient.id and getattr(phone, 'admin_id', None) == me.id:
                    record['phoneStates'].append(type(phone).__name__)
                    receipt.write_text(json.dumps(record))
                    print('Telegram call update: ' + type(phone).__name__, flush=True)
        client.add_event_handler(phone_update, events.Raw())
        from pytgcalls import PyTgCalls
        from pytgcalls.types import CallConfig
        from pytgcalls.types.raw import Stream, AudioStream, AudioParameters
        from ntgcalls import MediaSource
        calls = PyTgCalls(client)
        original_connection_handler = calls._handle_connection_changed

        async def media_update(chat_id, info):
            if chat_id == recipient.id:
                record['mediaStates'].append(info.state.name)
                receipt.write_text(json.dumps(record))
                print('Media connection: ' + info.state.name, flush=True)
            await original_connection_handler(chat_id, info)
        calls._handle_connection_changed = media_update
        stopped = asyncio.Event()
        updates_task = None
        try:
            await calls.start()
            def registration(status):
                if status == 'registered':
                    record['updateRegistrations'] += 1
                else:
                    record['updateError'] = status
                receipt.write_text(json.dumps(record))
            updates_task = asyncio.create_task(maintain_call_updates(client, stopped, registration))
            stream = Stream(microphone=AudioStream(MediaSource.FILE, str(audio), AudioParameters(48000, 1)))
            waiting = ROOT / '.local/telegram-call-waiting.pcm'
            waiting.write_bytes(bytes(48000 * 2 * 90))
            waiting_stream = Stream(microphone=AudioStream(MediaSource.FILE, str(waiting), AudioParameters(48000, 1)))
            print('Placing the one-off Telegram test call now.', flush=True)
            def connected():
                record['status'] = 'connected'
                receipt.write_text(json.dumps(record))
                print('Call connected; starting the reminder from its beginning.', flush=True)
            await play_after_connection(calls, recipient.id, waiting_stream, stream, CallConfig(timeout=45), duration, connected)
            record['status'] = 'played'
        except Exception as error:
            record['status'] = 'failed'
            record['errorType'] = type(error).__name__
            raise
        finally:
            stopped.set()
            if updates_task:
                updates_task.cancel()
                await asyncio.gather(updates_task, return_exceptions=True)
            try:
                await asyncio.wait_for(calls.leave_call(recipient.id), timeout=10)
            except Exception:
                pass
            record['endedAt'] = datetime.now(timezone.utc).isoformat()
            receipt.write_text(json.dumps(record))
            calls.executor.shutdown(wait=False, cancel_futures=True)
    finally:
        await client.disconnect()


if __name__ == '__main__':
    if not (args.login or args.resolve or args.call):
        parser.error('Choose --login, --resolve or --call. No automatic calling.')
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, EOFError):
        print('Trial stopped.', flush=True)
        raise SystemExit(1)
    except RuntimeError as error:
        print(str(error), flush=True)
        raise SystemExit(1)
    except Exception as error:
        # Never dump credentials, session values or private login responses.
        print('Trial failed: ' + type(error).__name__ + '. No automatic retry.', flush=True)
        raise SystemExit(1)
