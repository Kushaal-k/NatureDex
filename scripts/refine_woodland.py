"""Draw the responsive pixel woodland as one continuous scene."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'public/pixel-woodland.svg').read_text(encoding='utf-8')
defs = source[source.index('<defs>'):source.index('</defs>') + 7]
parts = [defs]

def path(d, color, extra=''):
    parts.append(f'<path d="{d}" fill="{color}" {extra}/>')

def use(name, x, y, scale=1):
    parts.append(f'<use href="#{name}" transform="translate({x} {y}) scale({scale})"/>')

# Continuous layers avoid a visible join between the clearing and its edges.
path('M0 0h600v160H0z', '#bacf9e')
path('M248 0h132v48h-16v25H266V48h-18z', '#d9dfa9')
path('M318 14h18v3h6v5h3v16h-3v5h-6v3h-18v-3h-6v-5h-3V22h3v-5h6z', '#f7e7b2')
path('M0 52h35v-8h44v8h41v-10h31v5h34v10h46v-8h25v11h43v6h41v-7h27v-8h38v5h31v-11h40v8h42v-8h36v6h46v109H0z', '#a7bf8d')
for x, y in [(9,36),(47,31),(86,41),(116,27),(158,40),(186,30),(231,43),(266,48),(365,43),(403,31),(440,39),(475,27),(513,40),(553,28),(587,37)]:
    use('fir', x, y, 1.2)
for x, top, base in [(40,16,105),(96,21,98),(171,8,102),(238,25,98),(271,32,98),(378,15,101),(434,9,101),(502,19,106),(560,11,105)]:
    path(f'M{x} {top}h4v{base-top}h-4z M{x} {top+33}h-9v-3h-6v-3h-3v3h4v3h6v3h8z', '#789d79')
path('M0 91h24v-5h48v6h41v-8h37v9h52v-5h31v8h49v-5h48v5h30v-9h39v-6h28v8h48v-7h46v8h42v-6h38v6h33v70H0z', '#83a174')
path('M0 118h34v-7h41v5h42v-10h40v5h52v-6h38v6h31v-4h63v-4h44v-6h38v9h48v-5h40v9h47v-6h42v56H0z', '#608750')
# Soft columns of sunlight stay pixel aligned.
path('M305 48h5v33h-5v18h-8V82h8z M347 42h4v38h-4v24h-7V77h7z', '#dce3a5', 'opacity=".36"')
# Trail narrows toward the horizon, then winds into the foreground.
path('M324 85h6v8h-12v9h-9v8h18v7h13v13h-13v11h-19v19h-63v-9h19v-12h26v-10h18v-6h-20v-8h-6v-13h13v-8h19v-5h10z', '#9f9060')
path('M325 85h4v7h-12v10h-9v10h17v7h10v10h-14v11h-20v20h-48v-6h18v-12h25v-10h19v-12h-21v-7h-8v-9h14v-8h18v-5h7z', '#d2ba7f')
path('M319 96h7v2h-7m-14 11h7v2h-7m9 17h11v2h-11m-24 19h13v3h-13m-27 11h12v2h-12', '#ecdaa1')
# A shaded pond reflects the opening between the trees.
path('M377 115h39v5h25v8h20v10h24v22H350v-12h9v-17h18z', '#355e49')
path('M382 119h32v6h25v8h18v10h20v17H361v-11h6v-14h15z', '#538675')
path('M386 124h25v6h25v7h17v10h15v13H370v-12h5v-11h11z', '#81afa0')
path('M386 129h22v2h-22m-5 15h35v2h-35m48-7h16v2h-16m-25 14h37v2h-37', '#c6dcb7')
# Irregular trees have roots, branching trunks and light on one edge.
for x, top, base, width in [(16,15,147,13),(91,8,131,8),(192,7,143,12),(417,4,130,11),(508,13,143,9),(579,0,158,15)]:
    path(f'M{x} {top}h{width}v{base-top-12}h5v8h8v5h-32v-5h7v-12h-2V{top+40}h2z', '#2c4938')
    path(f'M{x+width-5} {top+5}h3v{base-top-22}h-3z', '#8f8451')
    path(f'M{x} {top+48}h-10v-5h-10v-4h-6v-14h4v11h8v4h9v4h5z M{x+width} {top+34}h9v-5h7v-15h4v18h-7v5h-13z', '#2c4938')
    for dx, dy, scale in [(-30,-10,1.4),(-2,-19,1.7),(-20,12,1.1),(17,1,1.2)]:
        use('leaves', x+dx, top+dy, scale)
# Overhanging clusters frame a deliberately open central sky.
for x,y,scale in [(33,-25,1.8),(119,-29,1.9),(229,-34,1.8),(359,-35,1.6),(454,-28,1.8),(544,-31,1.7)]:
    use('leaves',x,y,scale)
path('M0 144h31v-7h25v7h29v-5h35v6h39v-8h35v7h34v16H0z M476 150h25v-8h28v7h34v-7h37v18H465v-5h11z', '#315c3d')
# A recognizable perched bird, safely clear of the capture button.
path('M421 69h-15v-3h-12v-3h-11v-3h-5v4h10v3h12v3h21z', '#2c4938')
path('M390 49h5v-4h7v3h3v8h-3v4h-10v-3h-5v-4h-5v-3h8z', '#25473b')
path('M394 50h8v7h-3v2h-6v-3h-2v-4h3z', '#df9a55')
path('M391 50h5v5h-6v-2h-3v-2h4z', '#729371')
path('M399 47h2v2h-2', '#fff0c6')
path('M405 49h3v2h-3m-13 11h2v3h-2m5-3h2v3h-2', '#e4bd70')
# Butterfly and flowers add small warm accents to the cool woodland.
path('M293 78h4v2h2v6h-3v3h-4v-3h-2v-6h3m11-2h4v2h3v6h-2v3h-4v-3h-3v-6h2', '#dfac59')
path('M294 80h3v4h-3m11-4h3v4h-3', '#ffe3a0')
path('M299 80h3v11h-3m-2-14h2v3h-2m5-3h2v3h-2', '#35513a')
for x,y in [(50,140),(155,130),(219,153),(245,125),(350,120),(433,117),(493,140),(561,150)]:
    use('fern',x,y)
for x,y in [(59,120),(147,144),(223,134),(235,139),(345,109),(354,116),(371,107),(483,131),(542,125),(553,133)]:
    use('flower',x,y)
for x,y in [(175,127),(209,119),(472,142)]:
    use('mushroom',x,y)
for x,y in [(44,105),(128,122),(164,100),(226,114),(264,106),(341,99),(361,146),(444,104),(520,123),(552,108)]:
    use('grass',x,y)
path('M282 62h2v2h-2m57 9h2v2h-2m-23-15h2v2h-2m42 28h2v2h-2', '#fff0c6')

for filename, viewbox in [('pixel-woodland-panorama.svg','0 0 600 160'),('pixel-woodland.svg','210 0 240 160')]:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" shape-rendering="crispEdges" role="img" aria-labelledby="title desc">\n<title id="title">A quiet woodland discovery</title>\n<desc id="desc">Sunlight falls through layered trees onto a winding path, with a bird, butterfly, ferns, mushrooms and a reflective woodland pool.</desc>\n' + '\n'.join(parts) + '\n</svg>\n'
    (ROOT / 'public' / filename).write_text(svg, encoding='utf-8', newline='\n')

# A compact composition keeps the focal points above the phone's button.
parts = [defs]
path('M0 0h240v132H0z', '#b9cea0')
path('M79 0h87v40h-12v24H88V40h-9z', '#dde1ad')
path('M116 10h16v3h5v5h3v12h-3v5h-5v3h-16v-3h-5v-5h-3V18h3v-5h5z', '#f7e5ab')
path('M0 52h22v-9h30v7h23v-5h24v12h28v5h22v-9h26v-9h33v6h32v82H0z', '#9bb789')
for x,y in [(48,32),(73,39),(161,35),(189,27)]:
    use('fir',x,y)
path('M51 17h3v63h-3m13-52h3v52h-3m102-64h4v64h-4m16-58h3v58h-3', '#87a782')
path('M0 81h26v-7h29v7h28v-4h31v7h29v-6h28v-7h35v7h34v54H0z', '#72965f')
path('M0 105h31v-9h31v8h29v-8h31v8h34v-9h38v8h46v29H0z', '#4c764c')
path('M125 68h5v9h-12v9h-8v7h19v8h12v12h-16v19H76v-8h20v-13h21v-8H99V89h9v-9h13v-5h4z', '#a59564')
path('M126 68h3v8h-12v11h-9v8h18v8h10v8h-17v21H84v-6h19v-12h19v-14h-19V90h9v-8h12v-6h2z', '#dcc58b')
path('M133 48h4v17h-4v10h-5V63h5z', '#e4e5b0', 'opacity=".55"')
path('M160 83h30v5h24v8h26v36h-94v-13h7v-17h7z', '#3a6755')
path('M165 87h24v6h23v9h28v30h-83v-14h5v-16h3z', '#79a697')
path('M169 92h16v2h-16m-2 15h25v2h-25m31-6h14v2h-14m-22 14h21v2h-21', '#c2d5af')
for x,top,base in [(30,4,115),(203,0,114)]:
    path(f'M{x} {top}h10v88h-2v15h6v8h-25v-5h7v-15h-2V{top+35}h6z', '#294b39')
    path(f'M{x+5} {top+13}h3v73h-3z', '#928253')
    path(f'M{x} {top+47}h-10v-4h-7v-17h3v14h8v3h6z', '#294b39')
for x,y,scale in [(-16,-9,1.4),(17,-18,1.5),(49,-22,1.2),(-13,18,1.3),(8,5,1.15),(184,-19,1.5),(217,-10,1.4),(161,-27,1.2),(213,18,1.15),(194,5,1.1)]:
    use('leaves',x,y,scale)
# Bird and butterfly sit in the open area, away from the lower control.
path('M205 60h-17v-4h-16v-4h-7v3h10v4h12v4h18z', '#294b39')
path('M177 42h5v-4h7v3h3v8h-3v4h-10v-3h-5v-4h-5v-3h8z', '#25473b')
path('M181 43h8v7h-3v2h-6v-3h-2v-4h3z', '#e1a15e')
path('M178 43h5v5h-6v-2h-3v-2h4z', '#7c9971')
path('M186 40h2v2h-2', '#fff0c6')
path('M192 42h3v2h-3m-13 12h2v3h-2m5-3h2v3h-2', '#e4bd70')
path('M86 58h4v2h2v6h-3v3h-4v-3h-2v-6h3m11-2h4v2h3v6h-2v3h-4v-3h-3v-6h2', '#db9c4b')
path('M87 60h3v4h-3m11-4h3v4h-3', '#ffe2a0')
path('M92 60h3v11h-3m-2-14h2v3h-2m5-3h2v3h-2', '#35513a')
for x,y in [(52,86),(62,91)]:
    use('mushroom',x,y,.8)
for x,y in [(20,122),(39,111),(220,100),(200,128)]:
    use('fern',x,y)
for x,y in [(70,86),(148,77),(158,83),(44,120),(219,118)]:
    use('flower',x,y)
for x,y in [(10,97),(73,106),(146,103),(192,79),(229,126)]:
    use('grass',x,y)
path('M109 47h2v2h-2m36 12h2v2h-2m-14-15h2v2h-2', '#fff0c6')
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 132" shape-rendering="crispEdges" role="img" aria-labelledby="title desc"><title id="title">A little woodland window</title><desc id="desc">Close trees frame a sunny trail, butterfly and perched bird, with flowers and a quiet pond below.</desc>\n' + '\n'.join(parts) + '\n</svg>\n'
(ROOT / 'public/pixel-woodland-mobile.svg').write_text(svg, encoding='utf-8', newline='\n')
