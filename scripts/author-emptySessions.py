"""Author emptySessions.svg by hand.

Two reasons this is not a generator job:

 1. The build cannot render `stroke-dasharray` at all — Icon.js strokes a
    single path with no dash property and generate-icons.mjs does not carry
    one. The "missing bar" therefore has to be drawn as literal short
    segments, which is a constraint about this pipeline rather than about
    drawing, and not something a prompt can usefully convey.
 2. It is nine straight lines. Precedent: statusComplete was authored the same
    way when its source used masks the generator could not fold.

Geometry, front view of a rack:
  uprights   x=16 and x=48, y 10..52
  feet       14u wide at y=52, so the shape stands rather than floats
  cradles    J-hooks at y=28: an arm inward from each post with an upturned
             lip, which is the part that says "rack"
  bar        three dashes at y=24, resting height, between the two lips
"""
import io

L, R = 16, 48          # uprights
TOP, BOT = 10, 52
FOOT = 7               # half-width of each foot
ARM = 7                # how far each cradle reaches inward
CR_Y = 28              # cradle floor
LIP = 6                # how far the lip turns up
BAR_Y = 24             # where the absent bar would sit

# Dashes: three of them, inside the span between the two cradle lips.
span_a, span_b = L + ARM + 1, R - ARM - 1
n = 3
gap = 2.0
dash = ((span_b - span_a) - gap * (n - 1)) / n
bars = []
x = span_a
for _ in range(n):
    bars.append(f'<line x1="{x:.1f}" y1="{BAR_Y}" x2="{x + dash:.1f}" y2="{BAR_Y}"/>')
    x += dash + gap

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="{L}" y1="{TOP}" x2="{L}" y2="{BOT}"/>
  <line x1="{R}" y1="{TOP}" x2="{R}" y2="{BOT}"/>

  <line x1="{L - FOOT}" y1="{BOT}" x2="{L + FOOT}" y2="{BOT}"/>
  <line x1="{R - FOOT}" y1="{BOT}" x2="{R + FOOT}" y2="{BOT}"/>

  <polyline points="{L},{CR_Y} {L + ARM},{CR_Y} {L + ARM},{CR_Y - LIP}"/>
  <polyline points="{R},{CR_Y} {R - ARM},{CR_Y} {R - ARM},{CR_Y - LIP}"/>

  {chr(10) + "  ".join(bars)}
</svg>
'''
out = r"C:\Users\serap\AppData\Local\Temp\claude\C--Users-serap\d74965a6-d9fe-4036-8bf3-e9f302a72829\scratchpad\emptySessions.svg"
io.open(out, 'w', encoding='utf-8', newline='\n').write(svg)
print(svg)
print('wrote', out)
