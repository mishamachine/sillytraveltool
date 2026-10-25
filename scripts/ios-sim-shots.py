#!/usr/bin/env python3
"""Drive the booted iOS Simulator and take screenshots (used by .github/workflows/ios.yml).

Taps go through AXe (https://github.com/cameroncooke/AXe), which reads the accessibility
tree, so native alerts and any labelled web content are found by text.

env: UDID, OUT (screenshot dir), DEEPLINK (optional: signs the test account in),
     DEMO=1 (demo build with flagship=N: opens the plan and scrolls to the shared-traveller card),
     TRIP (optional: text in the trip card to open, default "Lisbon"),
     PREFIX (file-name prefix), ONLY_TRIPS=1 (stop after the Trips screen), LAUNCH_WAIT (seconds, default 10),
     TAPS (optional: "trip=x,y;plan=x,y;back=x,y;import=x,y" in points). WKWebView content is
     often missing from the accessibility tree, so these coordinates are the fallback.
"""
import json, os, subprocess, sys, time

UDID = os.environ['UDID']
OUT = os.environ.get('OUT', 'shots')
DEEPLINK = os.environ.get('DEEPLINK', '').strip()
TRIP = os.environ.get('TRIP', 'Lisbon')
TAPS = dict(p.split("=") for p in os.environ.get("TAPS", "").replace(" ", "").split(";") if "=" in p)
PREFIX = os.environ.get("PREFIX", "")
ONLY_TRIPS = os.environ.get("ONLY_TRIPS") == "1"
LAUNCH_WAIT = int(os.environ.get("LAUNCH_WAIT", "10"))
DEMO = os.environ.get("DEMO") == "1"
BUNDLE = 'com.sillytraveltool.app'
os.makedirs(OUT, exist_ok=True)


def run(*args, check=True):
    print('$', ' '.join(a if 'token' not in a else '<deeplink>' for a in args), flush=True)
    return subprocess.run(args, check=check, capture_output=True, text=True)


def shot(name):
    run('xcrun', 'simctl', 'io', UDID, 'screenshot', f"{OUT}/{PREFIX}{name}.png")
    with open(f"{OUT}/{PREFIX}{name}.ui.json", 'w') as f:
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


def tap(text, exact=False, timeout=20, key=None):
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
    if key in TAPS:
        x, y = TAPS[key].split(",")
        print(f"tap {key} at {x},{y} (fallback)", flush=True)
        run("axe", "tap", "-x", x, "-y", y, "--udid", UDID)
        return True
    print(f'!! no element matching "{text}"', flush=True)
    return False


ok = True
run('xcrun', 'simctl', 'launch', UDID, BUNDLE)
time.sleep(LAUNCH_WAIT)
shot('01-signed-out')

if DEEPLINK:
    run('xcrun', 'simctl', 'openurl', UDID, DEEPLINK)
    time.sleep(3)
    tap('Open', exact=True, timeout=4)  # iOS may confirm "Open in Silly Travel Tool?"
    time.sleep(10)
    shot('02-trips')

if DEMO:
    # Demo build, no account: the flagship trip's BCN -> BER flight, one card for three travellers
    time.sleep(5)
    shot('02-demo-today')
    ok &= tap('Full trip plan', timeout=15)
    time.sleep(4)
    for i in range(14):
        hits = [f for l, f in elements() if 'Maria Silva' in l]
        if hits and 150 < hits[0]['y'] < 650:
            break
        run('axe', 'swipe', '--start-x', '200', '--start-y', '640', '--end-x', '200', '--end-y', '340', '--udid', UDID, check=False)
        time.sleep(1.5)
        if not hits:
            shot(f'03-scroll-{i:02d}')  # WKWebView text may be missing from the tree: keep every step
    shot('04-shared-leg')

if DEEPLINK and not ONLY_TRIPS:
    ok &= tap(TRIP, timeout=8, key="trip")
    time.sleep(4)
    shot('03-trip')
    ok &= tap("Plan", exact=True, timeout=8, key="plan")
    time.sleep(3)
    shot('04-plan')

    tap("Back", exact=True, timeout=5, key="back")
    time.sleep(3)
    ok &= tap("Paste a booking confirmation", timeout=8, key="import")
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
