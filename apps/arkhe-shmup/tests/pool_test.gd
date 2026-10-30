extends SceneTree
const Pool = preload("res://scripts/fixed_pool.gd")
const Grid = preload("res://scripts/spatial_grid.gd")
const Drag = preload("res://scripts/relative_drag.gd")
const Economy = preload("res://scripts/monetization.gd")
var failures := 0

func check(ok: bool, label: String) -> void:
	if not ok:
		push_error(label)
		failures += 1

func _initialize() -> void:
	var pool := Pool.new(2)
	var a := pool.acquire(Vector2(63, 63), Vector2.ZERO, 1)
	var b := pool.acquire(Vector2(400, 400), Vector2.ZERO, 1)
	check(a != b, "unique active slots")
	check(pool.acquire(Vector2.ZERO, Vector2.ZERO, 1) == -1, "exhaustion never expands")
	check(pool.capacity == 2 and pool.dropped == 1, "fixed capacity and drop counter")
	pool.release(a)
	pool.release(a)
	check(pool.available == 1, "double release is harmless")
	check(pool.acquire(Vector2(63, 63), Vector2.ZERO, 1) == a, "slot reused")
	var grid := Grid.new(2)
	grid.rebuild(pool)
	check(grid.first_hit(pool, Vector2(66, 66), 8) == a, "cross-cell circle query")
	pool.release(a)
	check(grid.first_hit(pool, Vector2(66, 66), 8) == -1, "stale grid ignores released slots")
	pool.step(2)
	check(pool.available == 2, "expiry returns slot")
	for iteration in 10000:
		pool.acquire(Vector2.ZERO, Vector2.ONE, 1)
		pool.clear()
	check(pool.available == 2, "repeated resets preserve free-list")
	var drag := Drag.new()
	drag.begin(3, Vector2(270, 890))
	drag.drag(Vector2(300, 800))
	check(drag.target == Vector2(300, 700), "relative delta and finger offset")
	drag.begin(3, Vector2(300, 700))
	drag.drag(Vector2(300, 800))
	check(drag.dash_requested, "fast backward swipe")
	drag.cancel()
	check(drag.pointer == -1 and not drag.dash_requested, "focus cancellation")
	var economy := Economy.new()
	economy.booster.expires_at_unix = 200
	economy.vip.reward_bonus_bps = 1000
	check(economy.preview_reward(630, 100, true) == 2772, "server policy preview")
	check(not economy.preview_no_ads(200), "subscription expires at boundary")
	print("Pool/grid/drag/economy checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
