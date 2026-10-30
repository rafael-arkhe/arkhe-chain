extends SceneTree
const Main = preload("res://scenes/main.tscn")
var failures := 0

func check(ok: bool, label: String) -> void:
	if not ok:
		push_error(label)
		failures += 1

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game = Main.instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game.activate_absorption()
	game.hostile.acquire(game.player + Vector2(10, 0), Vector2.ZERO, 2)
	game._physics_process(1.0 / 60)
	check(game.absorbed == 1, "absorption converts hostile bullet")
	check(game.shots.available < game.shots.capacity, "auto-fire without held touch")
	game.activate_dash()
	game.damage()
	check(game.hp == 5 and game.dash == 1.5, "dash invulnerability")
	game.restart()
	game.hostile.clear()
	for i in 1000:
		game.hostile.acquire(Vector2(20 + i % 500, 100 + i % 400), Vector2(0, 10), 15)
	game.hp = 10000
	for tick in 600:
		game._physics_process(1.0 / 60)
	check(game.hostile.capacity == 1024, "dense gameplay preserves capacity")
	check(game.elapsed > 9.9 and game.kills > 0, "simulation and enemy collision advance")
	game.hp = 0
	game._physics_process(1.0 / 60)
	check(game.ended and game.restart_button.visible, "defeat exposes restart")
	game.restart()
	check(game.hp == 5 and not game.ended and game.hostile.available == 1024, "restart resets pools")
	print("Gameplay checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
