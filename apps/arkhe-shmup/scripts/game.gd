extends Node2D
## All simulation entities are fixed slots; rendering uses immediate primitives.
const Pool = preload("res://scripts/fixed_pool.gd")
const Drag = preload("res://scripts/relative_drag.gd")
const Grid = preload("res://scripts/spatial_grid.gd")
var shots := Pool.new(192)
var hostile := Pool.new(1024)
var enemies := Pool.new(48)
var particles := Pool.new(256)
var scrap := Pool.new(128)
var grid := Grid.new(48)
var drag := Drag.new()
var player := Vector2(270, 790)
var elapsed := 0.0
var fire_timer := 0.0
var spawn_timer := 0.0
var enemy_fire := 0.0
var absorption := 0.0
var absorption_cd := 0.0
var dash := 0.0
var dash_cd := 0.0
var hurt := 0.0
var hp := 5
var absorbed := 0
var kills := 0
var collected := 0
var ended := false
var paused := false
var hud: Label
var status: Label
var absorb_button: Button
var restart_button: Button
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	Engine.max_fps = 60
	rng.seed = 4262026
	# UI creation is confined to initialization.
	var ui := CanvasLayer.new()
	add_child(ui)
	hud = Label.new()
	hud.position = Vector2(16, 12)
	ui.add_child(hud)
	status = Label.new()
	status.position = Vector2(40, 400)
	ui.add_child(status)
	absorb_button = Button.new()
	absorb_button.text = "ABSORVER [Espaço]"
	absorb_button.position = Vector2(12, 898)
	absorb_button.size = Vector2(220, 48)
	absorb_button.pressed.connect(activate_absorption)
	ui.add_child(absorb_button)
	restart_button = Button.new()
	restart_button.text = "NOVA PARTIDA"
	restart_button.position = Vector2(290, 898)
	restart_button.size = Vector2(235, 48)
	restart_button.pressed.connect(restart)
	ui.add_child(restart_button)
	restart()

func restart() -> void:
	shots.clear()
	hostile.clear()
	enemies.clear()
	particles.clear()
	scrap.clear()
	player = Vector2(270, 790)
	drag.cancel()
	drag.target = player
	elapsed = 0
	fire_timer = 0
	spawn_timer = 0
	enemy_fire = 0
	absorption = 0
	absorption_cd = 0
	dash = 0
	dash_cd = 0
	hurt = 0
	hp = 5
	absorbed = 0
	kills = 0
	collected = 0
	ended = false
	paused = false
	rng.seed = 4262026
	status.text = ""
	restart_button.visible = false

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		paused = true
		drag.cancel()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		paused = false

func _unhandled_input(event: InputEvent) -> void:
	if ended or paused:
		return
	drag.input(event)
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_SPACE:
			activate_absorption()
		elif event.keycode == KEY_SHIFT:
			activate_dash()

func activate_absorption() -> void:
	if not ended and not paused and absorption_cd <= 0:
		absorption = 2.5
		absorption_cd = 9.0

func activate_dash() -> void:
	if dash_cd <= 0:
		dash = 1.5
		dash_cd = 7.0

func _physics_process(dt: float) -> void:
	if ended or paused:
		return
	elapsed += dt
	absorption_cd = maxf(0, absorption_cd - dt)
	absorption = maxf(0, absorption - dt)
	dash_cd = maxf(0, dash_cd - dt)
	dash = maxf(0, dash - dt)
	hurt = maxf(0, hurt - dt)
	if drag.dash_requested:
		activate_dash()
		drag.dash_requested = false
	player = drag.step(player, dt)
	var world_dt := dt * (0.25 if dash > 0 else 1.0)
	shots.step(dt)
	hostile.step(world_dt)
	enemies.step(world_dt)
	particles.step(world_dt)
	scrap.step(world_dt)
	fire_timer -= dt
	if fire_timer <= 0:
		fire_timer += 0.12
		shots.acquire(player + Vector2(-9, -18), Vector2(0, -820), 1.3)
		shots.acquire(player + Vector2(9, -18), Vector2(0, -820), 1.3)
	spawn_timer -= world_dt
	if spawn_timer <= 0:
		spawn_timer += 0.75
		enemies.acquire(Vector2(rng.randf_range(35, 505), -20), Vector2(0, 85), 14, 3)
	enemy_fire -= world_dt
	if enemy_fire <= 0:
		enemy_fire += 0.8
		for i in enemies.capacity:
			if enemies.active[i] == 0:
				continue
			var direction := (player - enemies.position[i]).normalized()
			for angle in range(-1, 2):
				hostile.acquire(enemies.position[i], direction.rotated(angle * 0.24) * 190, 7)
	# Always partition enemy queries, including when total bullets exceed 300.
	grid.rebuild(enemies)
	for i in shots.capacity:
		if shots.active[i] == 0:
			continue
		var enemy := grid.first_hit(enemies, shots.position[i], 25)
		if enemy != -1:
			shots.release(i)
			enemies.hp[enemy] -= 1
			enemies.flash[enemy] = 0.1
			burst(enemies.position[enemy], 2)
			if enemies.hp[enemy] <= 0:
				scrap.acquire(enemies.position[enemy], Vector2(0, 95), 12)
				enemies.release(enemy)
				kills += 1
	for i in hostile.capacity:
		if hostile.active[i] == 0:
			continue
		var delta := player - hostile.position[i]
		if absorption > 0 and delta.length_squared() < 150 * 150:
			hostile.position[i] += delta.normalized() * minf(delta.length(), 600 * dt)
			if delta.length_squared() < 30 * 30:
				hostile.release(i)
				absorbed += 1
			continue
		if delta.length_squared() < 15 * 15:
			hostile.release(i)
			damage()
	for i in enemies.capacity:
		if enemies.active[i] != 0 and enemies.position[i].distance_squared_to(player) < 30 * 30:
			enemies.release(i)
			damage()
	for i in scrap.capacity:
		if scrap.active[i] != 0 and scrap.position[i].distance_squared_to(player) < 36 * 36:
			scrap.release(i)
			collected += 1
	if hp <= 0:
		ended = true
		status.text = "FIM DA MISSÃO\nPrévia local: %d pontos\nCrédito depende de validação do servidor." % preview_points()
		restart_button.visible = true
	# UI text refresh at 5 Hz, outside entity data paths.
	if Engine.get_physics_frames() % 12 == 0:
		hud.text = "ARKHE / GRAVITY RUN\nHP %d  •  Abatidos %d  •  Scrap %d\nAbsorvidos %d  •  Campo %.1fs  •  Dash %.1fs" % [hp, kills, collected, absorbed, absorption_cd, dash_cd]
	queue_redraw()

func damage() -> void:
	if dash > 0 or hurt > 0:
		return
	hp -= 1
	hurt = 1.0
	burst(player, 16)

func preview_points() -> int:
	return int(elapsed) + int(kills / 5.0) * 25 + absorbed * 2

func burst(at: Vector2, count: int) -> void:
	for i in count:
		particles.acquire(at, Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(35, 130), 0.3)

func _draw() -> void:
	# Background transition signals departure from orbit without loading screens.
	var phase := clampf(elapsed / 90.0, 0, 1)
	draw_rect(Rect2(0, 0, 540, 960), Color(0.015 + phase * 0.04, 0.025, 0.07 + phase * 0.07))
	for i in 90:
		var y := fmod(float(i * 173) + elapsed * (20 + i % 3 * 18), 960)
		draw_circle(Vector2((i * 137) % 540, y), 1 + i % 2, Color(0.3, 0.4, 0.6))
	for i in particles.capacity:
		if particles.active[i] != 0:
			draw_circle(particles.position[i], 3, Color(1, 0.6, 0.2, particles.life[i] / 0.3))
	for i in scrap.capacity:
		if scrap.active[i] != 0:
			draw_circle(scrap.position[i], 5, Color(0.4, 1, 0.5))
	for i in enemies.capacity:
		if enemies.active[i] != 0:
			draw_circle(enemies.position[i], 19, Color.WHITE if enemies.flash[i] > 0 else Color(1, 0.25, 0.3))
	if absorption > 0:
		draw_arc(player, 150, 0, TAU, 64, Color(0.2, 0.6, 1, 0.5), 2)
	draw_circle(player, 13, Color.WHITE if hurt > 0 else Color(0.2, 0.9, 1))
	if dash > 0:
		draw_arc(player, 23, 0, TAU, 24, Color.WHITE, 2)
	for i in shots.capacity:
		if shots.active[i] != 0:
			draw_circle(shots.position[i], 3, Color(0.4, 1, 1))
	# Highest visual priority: hostile projectiles, with inexpensive glow surrogate.
	for i in hostile.capacity:
		if hostile.active[i] != 0:
			draw_circle(hostile.position[i], 9, Color(1, 0.15, 0.4, 0.2))
			draw_circle(hostile.position[i], 5, Color(1, 0.2, 0.45))
