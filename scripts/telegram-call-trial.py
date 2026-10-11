"""Manual private Telegram call trial. Login never places a call.

Use the isolated .local/telegram-call-venv runtime. Credentials, session,
recipient configuration, recording and receipt stay in ignored .local/.env.local.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

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
    from telethon.tl.functions.contacts import ResolvePhoneRequest
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
        else:
            result = await client(ResolvePhoneRequest(phone=config['phone']))
            recipient = next((u for u in result.users if u.id == result.peer.user_id), None)
        if not isinstance(recipient, User) or recipient.bot or recipient.id == me.id:
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
        record = {'caller': me.id, 'recipient': recipient.id, 'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'attempting'}
        receipt.write_text(json.dumps(record))
        from pytgcalls import PyTgCalls
        from pytgcalls.types import CallConfig
        from pytgcalls.types.raw import Stream, AudioStream, AudioParameters
        from ntgcalls import MediaSource
        calls = PyTgCalls(client)
        try:
            await calls.start()
            stream = Stream(microphone=AudioStream(MediaSource.FILE, str(audio), AudioParameters(48000, 1)))
            print('Placing the one-off Telegram test call now.', flush=True)
            await asyncio.wait_for(calls.play(recipient.id, stream, CallConfig(timeout=25)), timeout=45)
            record['status'] = 'connected'
            receipt.write_text(json.dumps(record))
            print('Call connected; playing the test reminder.', flush=True)
            await asyncio.sleep(duration + 1)
            record['status'] = 'played'
        except Exception as error:
            record['status'] = 'failed'
            record['errorType'] = type(error).__name__
            raise
        finally:
            try:
                await asyncio.wait_for(calls.leave_call(recipient.id), timeout=10)
            except Exception:
                pass
            record['endedAt'] = datetime.now(timezone.utc).isoformat()
            receipt.write_text(json.dumps(record))
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
