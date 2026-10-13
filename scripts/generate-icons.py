"""Generate the KitBash KVM toolbar icon set (SVG).

Style: monochrome light-white line icons with rounded strokes, drawn for the logo-blue
command bar. Filled shapes mean "solid" (play, stop, pinned). Red is reserved for the two
live states: recording and an active video stream.

Each part: (svg element string without stroke/fill, stroke color or None, fill color or None)

Usage: python scripts/generate-icons.py src/assets/icons
"""
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

W = '#f4f7fa'  # light white
RED = '#ff3f1e'  # logo red-orange, live states only
SW = 2  # stroke width


def P(d):
    return f'<path d="{d}"/>'


def C(cx, cy, r):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}"/>'


def RECT(x, y, w, h, rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>'


def part(el, stroke=W, fill=None):
    return (el, stroke, fill)


def solid(el, color=W):
    return part(el, color, color)


def svg(parts):
    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        f'stroke-linecap="round" stroke-linejoin="round" stroke-width="{SW}">'
    ]
    for el, stroke, fill in parts:
        out.append(el.replace('/>', f' stroke="{stroke or "none"}" fill="{fill or "none"}"/>'))
    out.append('</svg>')
    return ''.join(out) + '\n'


def dots(points, color=W):
    return [part(P(f'M{x},{y}h0'), color) for x, y in points]


def video_source(color):
    return [
        part(RECT(3, 4, 18, 12, 2), color),
        part(P('M12,16V19.5 M8,20H16'), color),
        part(P('M6.5,12.5L9,10'), color),
    ]


corners_out = 'M4,9V4H9 M15,4H20V9 M20,15V20H15 M9,20H4V15'
corners_in = 'M9,4.5V9H4.5 M15,4.5V9H19.5 M19.5,15H15V19.5 M4.5,15H9V19.5'
scan_corners = 'M3.5,8V3.5H8 M16,3.5H20.5V8 M20.5,16V20.5H16 M8,20.5H3.5V16'
eye = 'M2.5,12C5.5,6.5 18.5,6.5 21.5,12C18.5,17.5 5.5,17.5 2.5,12Z'
pin_body = 'M9,3.5H15 M10.25,3.5V8.5L7,12.5H17L13.75,8.5V3.5'
plug = [
    part(P('M10,8V4.5 M14,8V4.5')),
    part(P('M7.5,8H16.5V11.5A4.5,4.5 0 0 1 7.5,11.5Z')),
]

ICONS = {
    # media sources
    'video-source': video_source(W),
    'video-source-live': video_source(RED),
    'audio-source': [
        solid(P('M3.5,9.5H7L11.5,5.5V18.5L7,14.5H3.5Z')),
        part(P('M15,9A4,4 0 0 1 15,15')),
        part(P('M17.5,6.5A7.5,7.5 0 0 1 17.5,17.5')),
    ],
    'microphone': [
        part(RECT(9, 3, 6, 11, 3)),
        part(P('M5.5,11.5A6.5,6.5 0 0 0 18.5,11.5')),
        part(P('M12,18V21')),
    ],
    'warning': [
        part(P('M12,3.5L21,19.5H3Z')),
        part(P('M12,9.5V13.5')),
        part(P('M12,16.5h0')),
    ],
    # stream control
    'play': [solid(P('M8,5L19,12L8,19Z'))],
    'stop': [solid(RECT(6, 6, 12, 12, 2))],
    'reset': [
        part(P('M19,12A7,7 0 1 1 16.95,7.05')),
        part(P('M19,4.5V8H15.5')),
        part(P('M9.75,9.75L14.25,14.25 M14.25,9.75L9.75,14.25')),
    ],
    # capture tools
    # Picture in a frame (save an image), not a camera, so it doesn't read as "recording"
    'screenshot': [
        part(RECT(3, 4.5, 18, 15, 2.5)),
        part(P('M3.5,17L9,11.5L13,15.5L15.5,13L20.5,18')),
        part(C(15.75, 9, 1.5)),
    ],
    'ocr': [
        part(P(scan_corners)),
        part(P('M8,8.5H16')),
        part(P('M12,11V16')),
    ],
    'qr-scan': [
        part(RECT(4, 4, 6, 6, 1)),
        part(RECT(14, 4, 6, 6, 1)),
        part(RECT(4, 14, 6, 6, 1)),
        *dots([(14.5, 14.5), (19.5, 19.5), (19.5, 14.5), (14.5, 19.5), (17, 17)]),
    ],
    'record': [
        part(C(12, 12, 8)),
        solid(C(12, 12, 3.25)),
    ],
    'recording': [
        part(C(12, 12, 8), RED),
        solid(C(12, 12, 4.5), RED),
    ],
    # KVM input
    'serial-connect': [*plug, part(P('M12,16V20.5'))],
    'serial-disconnect': [
        *plug,
        part(P('M12,16V17.25 M12,19.75V20.5')),
        part(P('M4,20L20,4')),
    ],
    'text-transfer': [
        part(RECT(5, 4.5, 14, 16.5, 2)),
        solid(RECT(9, 2.75, 6, 3, 1)),
        part(P('M8.5,11H15.5 M8.5,14.5H13')),
    ],
    'hotkeys': [
        part(RECT(2.5, 6.5, 19, 11, 2)),
        *dots([(6, 10), (9.5, 10), (13, 10), (18, 10)]),
        part(P('M8,14H16')),
    ],
    'media-keys': [
        solid(P('M3.5,6L11.5,12L3.5,18Z')),
        part(P('M15.5,6.5V17.5 M20,6.5V17.5')),
    ],
    'macros': [
        part(RECT(3.5, 3.5, 10.5, 17, 2)),
        part(P('M6.5,8H11 M6.5,11.5H9.5')),
        solid(P('M16,12.5L21.5,16.5L16,20.5Z')),
    ],
    # app
    'settings': [
        part(P(' '.join(
            f'M{12 + 6.5 * c:.2f},{12 + 6.5 * s:.2f}L{12 + 9 * c:.2f},{12 + 9 * s:.2f}'
            for c, s in [(1, 0), (0.7071, 0.7071), (0, 1), (-0.7071, 0.7071),
                         (-1, 0), (-0.7071, -0.7071), (0, -1), (0.7071, -0.7071)]))),
        part(C(12, 12, 6)),
        solid(C(12, 12, 2)),
    ],
    'video-only': [
        part(P(eye)),
        solid(C(12, 12, 2.75)),
    ],
    'video-only-off': [
        part(P(eye)),
        solid(C(12, 12, 2.75)),
        part(P('M4,20L20,4')),
    ],
    'fullscreen': [part(P(corners_out))],
    'fullscreen-exit': [part(P(corners_in))],
    # Pinned = solid, unpinned = outline
    'pin': [
        solid(P(pin_body)),
        part(P('M12,12.5V20.5')),
    ],
    'pin-off': [
        part(P(pin_body)),
        part(P('M12,12.5V20.5')),
    ],
    'loading': [
        part(P('M12,3.5A8.5,8.5 0 1 1 3.5,12')),
    ],
}

for name, parts in ICONS.items():
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg(parts))

print(f'wrote {len(ICONS)} icons to {OUT}')
