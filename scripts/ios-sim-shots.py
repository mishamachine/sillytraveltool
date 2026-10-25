#!/usr/bin/env python3
"""Drive the booted iOS Simulator, take screenshots and check the app (used by .github/workflows/ios.yml).

Taps go through AXe (https://github.com/cameroncooke/AXe), which reads the accessibility
tree, so native alerts and any labelled web content are found by text.

Checks (results.json next to the screenshots; any failure exits 1), the iOS counterpart of
scripts/android-emu-shots.mjs: the app process is still running after launch, the signed-out
screen is not blank (a white or black WebView means the bundle did not load), no crash report
was written, every tap found its target (accessibility label or the TAPS fallback) and changed
the screen. WKWebView text is not in the accessibility tree and there is no OCR on the runner,
so the "Continue with Google / email" labels themselves cannot be asserted here.

env: UDID, OUT (screenshot dir), DEEPLINK (optional: signs the test account in),
     TRIP (optional: text in the trip card to open, default "Lisbon"),
     PREFIX (file-name prefix), ONLY_TRIPS=1 (stop after the Trips screen), LAUNCH_WAIT (seconds, default 10),
     TAPS (optional: "trip=x,y;plan=x,y;back=x,y;import=x,y" in points). WKWebView content is
     often missing from the accessibility tree, so these coordinates are the fallback.
"""
import json, os, re, struct, subprocess, sys, time, zlib

UDID = os.environ['UDID']
OUT = os.environ.get('OUT', 'shots')
DEEPLINK = os.environ.get('DEEPLINK', '').strip()
TRIP = os.environ.get('TRIP', 'Lisbon')
TAPS = dict(p.split("=") for p in os.environ.get("TAPS", "").replace(" ", "").split(";") if "=" in p)
PREFIX = os.environ.get("PREFIX", "")
ONLY_TRIPS = os.environ.get("ONLY_TRIPS") == "1"
LAUNCH_WAIT = int(os.environ.get("LAUNCH_WAIT", "10"))
BUNDLE = 'com.sillytraveltool.app'
os.makedirs(OUT, exist_ok=True)

results = []


def check(name, ok, detail=''):
    results.append({'name': name, 'ok': bool(ok), 'detail': detail})
    print(f"{'PASS' if ok else 'FAIL'} {name} {detail}", flush=True)
    return bool(ok)


def run(*args, check=True):
    print('$', ' '.join(a if 'token' not in a else '<deeplink>' for a in args), flush=True)
    return subprocess.run(args, check=check, capture_output=True, text=True)


def shot(name):
    path = f"{OUT}/{PREFIX}{name}.png"
    run('xcrun', 'simctl', 'io', UDID, 'screenshot', path)
    with open(f"{OUT}/{PREFIX}{name}.ui.json", 'w') as f:
        f.write(ui_raw())
    return path


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


# ── Screenshot pixels (no PIL on the runner: a small PNG decoder for 8-bit RGB/RGBA/grey) ──

def png_pixels(path, step=1):
    """Returns (width, height, [(r, g, b), …]) sampling every `step`-th pixel of every `step`-th row.
    A full simulator screenshot takes ~20 s to unfilter in pure Python, so it is first shrunk to 160 px with
    macOS's sips (always on the runner); without sips the full image is decoded with a coarser step."""
    small = f"{path}.small.png"
    if subprocess.run(['sips', '-Z', '160', path, '--out', small], capture_output=True).returncode == 0:
        path = small
    else:
        step = 8
    data = open(path, 'rb').read()
    if path == small:
        os.remove(small)
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    pos, idat, width = 8, [], None
    while pos < len(data):
        length, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width, height, depth, ctype = struct.unpack('>IIBB', body[:10])
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
        pos += 12 + length
    if width is None or depth != 8 or ctype not in (0, 2, 4, 6):
        return None
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(b''.join(idat))
    stride = width * channels
    prev = bytearray(stride)
    pixels, offset = [], 0
    for y in range(height):
        ftype, line = raw[offset], bytearray(raw[offset + 1:offset + 1 + stride])
        offset += 1 + stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if ftype == 1: line[i] = (line[i] + a) & 255
            elif ftype == 2: line[i] = (line[i] + b) & 255
            elif ftype == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        if y % step == 0:
            for x in range(0, width, step):
                px = line[x * channels:x * channels + channels]
                pixels.append((px[0], px[1], px[2]) if channels >= 3 else (px[0], px[0], px[0]))
        prev = line
    return width, height, pixels


def screen_stats(path):
    """Distinct colours (quantised) and the share of near-white/near-black pixels, or None if unreadable."""
    decoded = png_pixels(path)
    if not decoded:
        return None
    _, _, pixels = decoded
    colours = {(r >> 4, g >> 4, b >> 4) for r, g, b in pixels}
    blank = sum(1 for r, g, b in pixels if (r > 240 and g > 240 and b > 240) or (r < 15 and g < 15 and b < 15))
    return {'colours': len(colours), 'blank_share': blank / max(1, len(pixels))}


def not_blank(name, path):
    stats = screen_stats(path)
    if stats is None:
        return check(name, False, 'screenshot unreadable')
    # The signed-out screen has the cream background, the terracotta logo and several buttons: dozens of colours.
    # A WebView that never loaded is one flat colour (white, black or the launch background).
    return check(name, stats['colours'] >= 12 and stats['blank_share'] < 0.98,
                 f"{stats['colours']} colours, {stats['blank_share']:.0%} blank")


def screen_changed(name, before, after):
    """A tap that found nothing leaves the screen as it was: compare sampled pixels of the two screenshots."""
    a, b = png_pixels(before), png_pixels(after)
    if not a or not b or len(a[2]) != len(b[2]):
        return check(name, False, 'screenshots unreadable')
    differing = sum(1 for p, q in zip(a[2], b[2]) if abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) > 48)
    share = differing / max(1, len(a[2]))
    return check(name, share > 0.02, f'{share:.0%} of the screen changed')


def app_pid():
    """PID of the running app in this simulator, or None. Simulator apps are host processes."""
    out = run('xcrun', 'simctl', 'spawn', UDID, 'launchctl', 'list', check=False).stdout
    for line in out.splitlines():
        if BUNDLE in line:
            pid = line.split()[0]
            if pid.isdigit():
                return int(pid)
    return None


# ── Launch ──
launched = run('xcrun', 'simctl', 'launch', UDID, BUNDLE, check=False)
m = re.search(rf'{re.escape(BUNDLE)}:\s*(\d+)', launched.stdout)
check('app launches', launched.returncode == 0 and m, (launched.stderr or launched.stdout).strip()[:200])
time.sleep(LAUNCH_WAIT)
pid = app_pid()
check('app process still running after launch', pid is not None, f'pid {pid}' if pid else 'not in launchctl list')
signed_out = shot('01-signed-out')
not_blank('signed-out screen rendered (not a blank WebView)', signed_out)

# ── Sign in through the deep link and walk the signed-in screens ──
if DEEPLINK:
    run('xcrun', 'simctl', 'openurl', UDID, DEEPLINK)
    time.sleep(3)
    tap('Open', exact=True, timeout=4)  # iOS may confirm "Open in Silly Travel Tool?"
    time.sleep(10)
    trips = shot('02-trips')
    screen_changed('deep link signs in (screen changed from signed-out)', signed_out, trips)
    check('app process still running after sign-in', app_pid() is not None)

if DEEPLINK and not ONLY_TRIPS:
    check('trip card tap target found', tap(TRIP, timeout=8, key="trip"))
    time.sleep(4)
    trip = shot('03-trip')
    screen_changed('trip opens', trips, trip)
    check('Plan tab tap target found', tap("Plan", exact=True, timeout=8, key="plan"))
    time.sleep(3)
    plan = shot('04-plan')
    screen_changed('Plan tab opens', trip, plan)

    tap("Back", exact=True, timeout=5, key="back")
    time.sleep(3)
    check('import tap target found', tap("Paste a booking confirmation", timeout=8, key="import"))
    time.sleep(3)
    sheet = shot('05-import-sheet')
    screen_changed('import sheet opens', plan, sheet)
    check('app process still running at the end', app_pid() is not None)

# ── Crash reports: any App crash log on the runner fails the run ──
logs = os.path.expanduser('~/Library/Logs/DiagnosticReports')
crashes = [n for n in os.listdir(logs) if n.startswith('App')] if os.path.isdir(logs) else []
for name in crashes:
    print('!! crash report', name, flush=True)
check('no crash report', not crashes, ', '.join(crashes))

with open(f"{OUT}/{PREFIX}results.json", 'w') as f:
    json.dump(results, f, indent=2)
failed = [r['name'] for r in results if not r['ok']]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed" + (f"; failed: {', '.join(failed)}" if failed else ''), flush=True)
sys.exit(0 if not failed else 1)
