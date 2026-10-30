class_name FixedPool
extends RefCounted
## Allocated once before gameplay. Exhaustion drops spawns, never grows.
var active := PackedByteArray()
var position := PackedVector2Array()
var velocity := PackedVector2Array()
var life := PackedFloat32Array()
var hp := PackedInt32Array()
var flash := PackedFloat32Array()
var free_ids := PackedInt32Array()
var available: int
var capacity: int
var dropped := 0

func _init(size: int) -> void:
	capacity = size
	available = size
	active.resize(size)
	position.resize(size)
	velocity.resize(size)
	life.resize(size)
	hp.resize(size)
	flash.resize(size)
	free_ids.resize(size)
	for i in size:
		free_ids[i] = size - i - 1

func acquire(at: Vector2, speed: Vector2, ttl: float, health: int = 1) -> int:
	if available == 0:
		dropped += 1
		return -1
	available -= 1
	var id := free_ids[available]
	active[id] = 1
	position[id] = at
	velocity[id] = speed
	life[id] = ttl
	hp[id] = health
	flash[id] = 0.0
	return id

func release(id: int) -> void:
	if id < 0 or id >= capacity or active[id] == 0:
		return
	active[id] = 0
	free_ids[available] = id
	available += 1

func clear() -> void:
	for i in capacity:
		release(i)

func step(dt: float) -> void:
	for i in capacity:
		if active[i] == 0:
			continue
		position[i] += velocity[i] * dt
		life[i] -= dt
		flash[i] = maxf(0, flash[i] - dt)
		if life[i] <= 0.0:
			release(i)
