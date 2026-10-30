import json, math, subprocess, sys, os, time
# Mission 5 (Kelheim): reale Geografie, auf F gestaucht (Ausschnitt ca. 13,8 x 11,3 km -> ca. 4,8 x 4,0 km)
S, N, W, E = 48.8085, 48.9103, 11.7327, 11.9215
F = .35; BS = .6   # Karten-Stauchung; Gebäude nur auf BS verkleinert
mid = (S + N) / 2; kxr = 111320 * math.cos(math.radians(mid)); kyr = 111200
kx, ky = kxr * F, kyr * F
NX, NY = 4, 3
els = {}
for i in range(NX):
    for j in range(NY):
        s = S + (N - S) * j / NY; n = S + (N - S) * (j + 1) / NY; w = W + (E - W) * i / NX; e = W + (E - W) * (i + 1) / NX
        q = f'[out:json][timeout:90];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|track)$"]({s},{w},{n},{e});way["building"]({s},{w},{n},{e});way["waterway"~"^(river|stream|canal)$"]({s},{w},{n},{e});way["natural"="water"]({s},{w},{n},{e}););out geom qt;'
        fn = f'tools/raw/m5_{i}{j}.json'
        if not os.path.exists(fn) or os.path.getsize(fn) < 100:
            ok = False
            for t in range(20):
                for u in ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter']:
                    subprocess.run(['curl', '-s', '-m', '150', '-A', 'ZombieOutbreakSim/1.0', '--data-urlencode', 'data=' + q, u, '-o', fn])
                    if os.path.exists(fn) and open(fn, 'rb').read(1) == b'{' and b'"elements"' in open(fn, 'rb').read(400):
                        ok = True; break
                    time.sleep(15)
                if ok: break
            print(fn, ok, os.path.getsize(fn) if os.path.exists(fn) else 0, flush=True)
        d = json.load(open(fn))
        for el in d['elements']: els[el['id']] = el
print('ways', len(els), flush=True)
def P(g): 
    o = []
    for p in g: o += [round((p['lon'] - W) * kx, 1), round((N - p['lat']) * ky, 1)]
    return o
RT = {'motorway': 5, 'trunk': 5, 'primary': 4, 'secondary': 4, 'tertiary': 3, 'unclassified': 3, 'residential': 3, 'living_street': 2, 'track': 1}
WD = {5: 12, 4: 9, 3: 7, 2: 5, 1: 4}
roads = []; blds = []; water = []
for el in els.values():
    t = el.get('tags', {}); g = el.get('geometry')
    if not g: continue
    if 'building' in t and len(g) >= 4:
        gg = g[:-1] if g[0] == g[-1] else g
        mx = [(p['lon'] - W) * kxr for p in gg]; my = [(N - p['lat']) * kyr for p in gg]
        ar = abs(sum(mx[i] * my[(i + 1) % len(gg)] - mx[(i + 1) % len(gg)] * my[i] for i in range(len(gg)))) / 2
        if ar < 45: continue
        cx = sum(mx) / len(mx); cy = sum(my) / len(my); o = []
        for a, b in zip(mx, my): o += [round(cx * F + (a - cx) * BS, 1), round(cy * F + (b - cy) * BS, 1)]
        blds.append(o)
    elif 'highway' in t and t['highway'] in RT:
        c = RT[t['highway']]; roads.append({'c': c, 'w': WD[c], 'p': P(g), 'br': 1 if t.get('bridge') and t['bridge'] != 'no' else 0})
    elif 'waterway' in t:
        wd = {'river': 8, 'canal': 8, 'stream': 3}[t['waterway']]
        if t.get('name') == 'Donau': wd = 40
        elif t.get('name') == 'Altmühl': wd = 14
        water.append({'w': wd, 'p': P(g), 'poly': False})
    elif t.get('natural') == 'water' and len(g) >= 4: water.append({'w': 0, 'p': P(g), 'poly': True})
out = {'id': 'm5', 'w': round((E - W) * kx), 'h': round((N - S) * ky), 'north': N, 'west': W, 'kx': kx, 'ky': ky, 'roads': roads, 'blds': blds, 'water': water}
open('maps/m5.js', 'w').write('(window.MAPS_DATA=window.MAPS_DATA||{}).m5=' + json.dumps(out, separators=(',', ':')) + ';')
print('m5', out['w'], out['h'], len(roads), len(blds), len(water), os.path.getsize('maps/m5.js'))
