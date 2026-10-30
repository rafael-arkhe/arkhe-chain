class_name Monetization
extends RefCounted
## Presentation only. No entitlement or balance is granted by this client.
class BoosterSubscription:
	var expires_at_unix: int = 0
	var energy_capacity_bonus: int = 0
	var ad_skip_remaining: int = 0
	func active(server_now: int) -> bool:
		return expires_at_unix > server_now

class SeasonPass:
	var season_id: String = ""
	var starts_at_unix: int = 0
	var ends_at_unix: int = 0
	var mission_xp: int = 0
	var premium: bool = false
	var claimed_free := PackedInt32Array()
	var claimed_premium := PackedInt32Array()
	func open(server_now: int) -> bool:
		return server_now >= starts_at_unix and server_now < ends_at_unix

class VipAccount:
	var permanent_points: int = 0
	var level: int = 0
	var reward_bonus_bps: int = 0
	var energy_regen_bonus_bps: int = 0

class RewardedGrant:
	var server_grant_id: String = ""
	var match_id: String = ""
	var purpose: String = "" # double_points OR revive_half_hp
	var expires_at_unix: int = 0

var booster := BoosterSubscription.new()
var season := SeasonPass.new()
var vip := VipAccount.new()

func preview_reward(base: int, server_now: int, rewarded: bool) -> int:
	var multiplier := 2 if booster.active(server_now) else 1
	multiplier *= 2 if rewarded else 1
	return int(base * multiplier * (10000 + vip.reward_bonus_bps) / 10000.0)

func preview_energy_capacity(base: int, server_now: int) -> int:
	return base + (booster.energy_capacity_bonus if booster.active(server_now) else 0)

func preview_no_ads(server_now: int) -> bool:
	return booster.active(server_now)
