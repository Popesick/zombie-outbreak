import json, math, sys
d = json.load(open('osm.json'))
lat0, lon0 = 48.4620, 11.9280
kx = 111320*math.cos(math.radians(48.47)); ky = 110574
def P(g): return [round((p['lon']-lon0)*kx,1) for p in g], [round((lat0 + 0.0170 - 0)*0,1)]  # unused
def pts(g):
    out=[]
    for p in g:
        out += [round((p['lon']-lon0)*kx,1), round((48.4790-p['lat'])*ky,1)]  # y down
    return out
roads=[]; blds=[]; water=[]; ways=[]
RT={'motorway':5,'trunk':5,'primary':4,'secondary':4,'tertiary':3,'unclassified':3,'residential':3,'living_street':2,'service':2,'pedestrian':2,'track':1,'path':0,'footway':0,'cycleway':0,'steps':0}
W={5:12,4:9,3:7,2:5,1:4,0:2}
for e in d['elements']:
    if e['type']!='way' or 'geometry' not in e: continue
    t=e.get('tags',{}); g=e['geometry']
    if 'building' in t and len(g)>=4:
        blds.append(pts(g[:-1] if g[0]==g[-1] else g))
    elif 'highway' in t and t['highway'] in RT:
        c=RT[t['highway']]
        roads.append({'c':c,'w':W[c],'p':pts(g)})
    elif 'waterway' in t and t['waterway'] in ('river','stream','canal','ditch','drain'):
        wd={'river':30,'canal':10,'stream':4}.get(t['waterway'],3)
        if t['waterway']=='river' and t.get('name','')=='Isar': wd=60
        water.append({'w':wd,'p':pts(g),'poly':False})
    elif t.get('natural')=='water' and len(g)>=4:
        water.append({'w':0,'p':pts(g),'poly':True})
out={'w':round((11.9540-lon0)*kx),'h':round((48.4790-48.4620)*ky),'roads':roads,'blds':blds,'water':water}
open('map-data.js','w').write('const MAP_DATA='+json.dumps(out,separators=(',',':'))+';')
print(out['w'],out['h'],len(roads),len(blds),len(water))
