#!/usr/bin/env python3
"""Drive the booted iOS Simulator and take screenshots (used by .github/workflows/ios.yml).

Taps go through AXe (https://github.com/cameroncooke/AXe), which reads the accessibility
tree, so WKWebView buttons are found by their visible text / aria-label.

env: UDID, OUT (screenshot dir), DEEPLINK (optional: signs the test account in),
     TRIP (optional: text in the trip card to open, default "Lisbon")
"""
import json, os, subprocess, sys, time

UDID = os.environ['UDID']
OUT = os.environ.get('OUT', 'shots')
DEEPLINK = os.environ.get('DEEPLINK', '').strip()
TRIP = os.environ.get('TRIP', 'Lisbon')
BUNDLE = 'com.sillytraveltool.app'
os.makedirs(OUT, exist_ok=True)


def run(*args, check=True):
    print('$', ' '.join(a if 'token' not in a else '<deeplink>' for a in args), flush=True)
    return subprocess.run(args, check=check, capture_output=True, text=True)


def shot(name):
    run('xcrun', 'simctl', 'io', UDID, 'screenshot', f'{OUT}/{name}.png')
    with open(f'{OUT}/{name}.ui.json', 'w') as f:
        f.write(ui_raw())


def ui_raw():
    return run('axe', 'describe-ui', '--udid', UDID, check=False).stdout


def elements():
    try:
        tree = json.loads(ui_raw())
    except ValueError:
        return []
    found = []

    def walk(node):
        if isinstance(node, dict):
            label = ' '.join(str(node.get(k) or '') for k in ('AXLabel', 'title', 'AXValue')).strip()
            frame = node.get('frame')
            if label and isinstance(frame, dict):
                found.append((label, frame))
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(tree)
    return found


def tap(text, exact=False, timeout=20):
    """Tap the smallest element whose label matches text; waits for it to appear."""
    end = time.time() + timeout
    while time.time() < end:
        hits = [(l, f) for l, f in elements()
                if (l.strip() == text if exact else text.lower() in l.lower())]
        if hits:
            label, f = min(hits, key=lambda h: h[1]['width'] * h[1]['height'])
            x, y = f['x'] + f['width'] / 2, f['y'] + f['height'] / 2
            print(f'tap "{label}" at {x:.0f},{y:.0f}', flush=True)
            run('axe', 'tap', '-x', str(round(x)), '-y', str(round(y)), '--udid', UDID)
            return True
        time.sleep(1)
    print(f'!! no element matching "{text}"', flush=True)
    return False


ok = True
run('xcrun', 'simctl', 'launch', UDID, BUNDLE)
time.sleep(10)
shot('01-signed-out')

if DEEPLINK:
    run('xcrun', 'simctl', 'openurl', UDID, DEEPLINK)
    time.sleep(3)
    tap('Open', exact=True, timeout=4)  # iOS may confirm "Open in Silly Travel Tool?"
    time.sleep(10)
    shot('02-trips')

    ok &= tap(TRIP)
    time.sleep(4)
    shot('03-trip')
    ok &= tap('Plan', exact=True)
    time.sleep(3)
    shot('04-plan')

    tap('Back', exact=True, timeout=5) or tap('Trips', exact=True, timeout=5)
    time.sleep(3)
    ok &= tap('Paste a booking confirmation')
    time.sleep(3)
    shot('05-import-sheet')

# Last crash logs, if any, end up next to the screenshots.
logs = os.path.expanduser('~/Library/Logs/DiagnosticReports')
if os.path.isdir(logs):
    for name in os.listdir(logs):
        if name.startswith('App'):
            print('!! crash report', name, flush=True)
            ok = False

sys.exit(0 if ok else 1)
