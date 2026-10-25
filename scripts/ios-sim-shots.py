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
    # Demo build, no account: the flagship trip's BCN -> BER flight, one card for three travellers.
    # WKWebView content is not in the accessibility tree here, so this taps by position and keeps every scroll step.
    def swipe(y0=640, y1=340):
        run('axe', 'swipe', '--start-x', '200', '--start-y', str(y0), '--end-x', '200', '--end-y', str(y1), '--udid', UDID, check=False)
        time.sleep(1.5)
    time.sleep(5)
    shot('02-demo-today')
    frames = [f for l, f in elements()]
    screen = max(frames, key=lambda f: f['width'] * f['height']) if frames else {'width': 402, 'height': 874}
    for _ in range(3):
        swipe()  # Today to its end: "Full trip plan" then sits just above the tab bar
    # "Full trip plan" (or the "Later today" row, which opens the plan too) sits 130-260 pt above the bottom,
    # depending on how much of Today fits: tap upward until the screen changes
    def screen_now():  # a 48 px bitmap of the screen: opening the plan changes most of it, a clock tick barely
        run('xcrun', 'simctl', 'io', UDID, 'screenshot', '/tmp/stt-probe.png')
        run('sips', '-Z', '48', '-s', 'format', 'bmp', '/tmp/stt-probe.png', '--out', '/tmp/stt-probe.bmp')
        with open('/tmp/stt-probe.bmp', 'rb') as f:
            return f.read()
    spots = [TAPS['plan_demo'].split(',')] if 'plan_demo' in TAPS else \
        [(str(round(screen['width'] / 2)), str(round(screen['height'] - up))) for up in range(133, 270, 25)]
    for x, y in spots:
        before = screen_now()
        print(f'tap Full trip plan at {x},{y}', flush=True)
        run('axe', 'tap', '-x', x, '-y', y, '--udid', UDID)
        time.sleep(4)
        after = screen_now()
        if sum(a != b for a, b in zip(before, after)) > len(before) * 0.3:
            break
    shot('03-plan-00')
    for i in range(1, 16):
        swipe(600, 350)
        shot(f'03-plan-{i:02d}')

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
