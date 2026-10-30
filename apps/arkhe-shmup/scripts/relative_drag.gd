class_name RelativeDrag
extends RefCounted
## Positions are viewport coordinates, independent of physical screen resolution.
var vertical_offset := 100.0
var response := 18.0
var target := Vector2(270, 790)
var pointer := -1
var previous := Vector2.ZERO
var started := Vector2.ZERO
var started_ms := 0
var dash_requested := false

func input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and pointer == -1:
			begin(event.index, event.position)
		elif not event.pressed and pointer == event.index:
			pointer = -1
	elif event is InputEventScreenDrag and event.index == pointer:
		drag(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed and pointer == -1:
			begin(-2, event.position)
		elif not event.pressed and pointer == -2:
			pointer = -1
	elif event is InputEventMouseMotion and pointer == -2:
		drag(event.position)

func begin(id: int, at: Vector2) -> void:
	pointer = id
	previous = at
	started = at
	started_ms = Time.get_ticks_msec()
	# Preserve x and avoid teleporting on contact. Constrain target above finger.
	target.y = minf(target.y, at.y - vertical_offset)

func drag(at: Vector2) -> void:
	target += at - previous
	target.y = minf(target.y, at.y - vertical_offset)
	previous = at
	if at.y - started.y >= 90.0 and Time.get_ticks_msec() - started_ms <= 220:
		dash_requested = true
		started_ms = -10000

func step(at: Vector2, dt: float) -> Vector2:
	target = target.clamp(Vector2(22, 60), Vector2(518, 920))
	return at.lerp(target, 1.0 - exp(-response * dt))

func cancel() -> void:
	pointer = -1
	dash_requested = false
