# -*- coding: utf-8 -*-
"""
해상 거리 계산 예시 스크립트.
사용법: python3 astar_example.py

landmask.png + map_coordinates.json을 읽어서 두 지점(도시/마을) 간
바다로만 이동 가능한 최단 경로 거리(게임 좌표계 px)를 계산한다.
"""
import json, math, heapq
from PIL import Image
import numpy as np

CELL = 10

def load_mask(path):
    img = Image.open(path).convert('L')
    arr = np.array(img)
    return (arr > 127).astype(np.uint8)  # 1=육지, 0=바다

def cell_of(x, y, rows, cols):
    c = int(x // CELL); r = int(y // CELL)
    return min(max(r, 0), rows - 1), min(max(c, 0), cols - 1)

def nearest_sea(mask, r, c, maxr=15):
    rows, cols = mask.shape
    if mask[r, c] == 0:
        return (r, c)
    for rad in range(1, maxr + 1):
        for dr in range(-rad, rad + 1):
            for dc in range(-rad, rad + 1):
                rr, cc = r + dr, c + dc
                if 0 <= rr < rows and 0 <= cc < cols and mask[rr, cc] == 0:
                    return (rr, cc)
    return None

MOVES = [(-1,0,1),(1,0,1),(0,-1,1),(0,1,1),
         (-1,-1,math.sqrt(2)),(-1,1,math.sqrt(2)),(1,-1,math.sqrt(2)),(1,1,math.sqrt(2))]

def astar(mask, start, goal):
    rows, cols = mask.shape
    if mask[start] == 1 or mask[goal] == 1:
        return None
    openh = [(0, start)]
    gscore = {start: 0}
    came = {}
    def heur(a, b):
        return math.hypot(a[0]-b[0], a[1]-b[1])
    while openh:
        _, cur = heapq.heappop(openh)
        if cur == goal:
            path = [cur]
            while cur in came:
                cur = came[cur]; path.append(cur)
            return gscore[goal], list(reversed(path))
        for dr, dc, cost in MOVES:
            nb = (cur[0]+dr, cur[1]+dc)
            if not (0 <= nb[0] < rows and 0 <= nb[1] < cols):
                continue
            if mask[nb] == 1:
                continue
            ng = gscore[cur] + cost
            if ng < gscore.get(nb, float('inf')):
                gscore[nb] = ng
                came[nb] = cur
                heapq.heappush(openh, (ng + heur(nb, goal), nb))
    return None

def sea_distance(mask, coords, name_a, name_b):
    """coords: map_coordinates.json 의 towns 또는 villages 딕셔너리"""
    rows, cols = mask.shape
    a, b = coords[name_a], coords[name_b]
    ra, ca = nearest_sea(mask, *cell_of(a['x'], a['y'], rows, cols))
    rb, cb = nearest_sea(mask, *cell_of(b['x'], b['y'], rows, cols))
    result = astar(mask, (ra, ca), (rb, cb))
    if result is None:
        return None
    g, path = result
    return g * CELL  # 게임 좌표계 px 거리

if __name__ == '__main__':
    mask = load_mask('landmask.png')
    data = json.load(open('../map_coordinates.json', encoding='utf-8'))
    towns = data['towns']
    d = sea_distance(mask, towns, '리스본', '나가사키')
    print('리스본 -> 나가사키 해상거리(px):', d)
