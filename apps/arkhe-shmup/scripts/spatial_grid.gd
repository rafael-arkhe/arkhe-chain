class_name SpatialGrid
extends RefCounted
## Intrusive fixed linked lists. No per-query arrays or dictionaries.
const CELL := 64
const COLS := 9
const ROWS := 16
var heads := PackedInt32Array()
var next := PackedInt32Array()

func _init(capacity: int) -> void:
	heads.resize(COLS * ROWS)
	next.resize(capacity)

func rebuild(pool: FixedPool) -> void:
	heads.fill(-1)
	for id in pool.capacity:
		if pool.active[id] == 0:
			continue
		var p := pool.position[id]
		if p.x < 0 or p.y < 0 or p.x >= COLS * CELL or p.y >= ROWS * CELL:
			continue
		var cell := int(p.y / CELL) * COLS + int(p.x / CELL)
		next[id] = heads[cell]
		heads[cell] = id

func first_hit(pool: FixedPool, at: Vector2, radius: float) -> int:
	var min_x := clampi(int(floor((at.x - radius) / CELL)), 0, COLS - 1)
	var max_x := clampi(int(floor((at.x + radius) / CELL)), 0, COLS - 1)
	var min_y := clampi(int(floor((at.y - radius) / CELL)), 0, ROWS - 1)
	var max_y := clampi(int(floor((at.y + radius) / CELL)), 0, ROWS - 1)
	for y in range(min_y, max_y + 1):
		for x in range(min_x, max_x + 1):
			var id := heads[y * COLS + x]
			while id != -1:
				if pool.active[id] != 0 and pool.position[id].distance_squared_to(at) <= radius * radius:
					return id
				id = next[id]
	return -1
