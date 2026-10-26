import json, math, sys
name, s, w, n, e = sys.argv[1], *map(float, sys.argv[2:6])
d = json.load(open(f'tools/raw/{name}.json'))
mid = (s + n) / 2
kx = 111320 * math.cos(math.radians(mid)); ky = 111200
def pts(g):
    out = []
    for p in g: out += [round((p['lon'] - w) * kx, 1), round((n - p['lat']) * ky, 1)]
    return out
RT = {'motorway':5,'trunk':5,'primary':4,'secondary':4,'tertiary':3,'unclassified':3,'residential':3,'living_street':2,'service':2,'pedestrian':2,'track':1,'path':0,'footway':0,'cycleway':0,'steps':0}
W = {5:12,4:9,3:7,2:5,1:4,0:2}
roads=[]; blds=[]; water=[]
for el in d['elements']:
    if el['type'] != 'way' or 'geometry' not in el: continue
    t = el.get('tags', {}); g = el['geometry']
    if 'building' in t and len(g) >= 4: blds.append(pts(g[:-1] if g[0] == g[-1] else g))
    elif 'highway' in t and t['highway'] in RT:
        c = RT[t['highway']]
        roads.append({'c': c, 'w': W[c], 'p': pts(g), 'br': 1 if t.get('bridge') and t['bridge'] != 'no' else 0})
    elif 'waterway' in t and t['waterway'] in ('river','stream','canal','ditch','drain'):
        wd = {'river': 30, 'canal': 10, 'stream': 4}.get(t['waterway'], 3)
        if t['waterway'] == 'river' and t.get('name', '') == 'Isar': wd = 60
        if t['waterway'] == 'river' and t.get('name', '') == 'Ilm': wd = 14
        water.append({'w': wd, 'p': pts(g), 'poly': False})
    elif t.get('natural') == 'water' and len(g) >= 4: water.append({'w': 0, 'p': pts(g), 'poly': True})
out = {'id': name, 'w': round((e - w) * kx), 'h': round((n - s) * ky), 'north': n, 'west': w, 'kx': kx, 'ky': ky, 'roads': roads, 'blds': blds, 'water': water}
open(f'maps/{name}.js', 'w').write('(window.MAPS_DATA=window.MAPS_DATA||{}).%s=' % name + json.dumps(out, separators=(',', ':')) + ';')
print(name, out['w'], out['h'], len(roads), len(blds), len(water))
