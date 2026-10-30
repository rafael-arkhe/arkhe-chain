import copy
import unittest
from arc_capture import CHAIN_ID, ERC20, SCALE, SYSTEM, TOPIC, decode, qualify, select_movements


def log(index=0, amount=100 * SCALE, emitter=SYSTEM):
    return {"address": emitter, "topics": [TOPIC, "0x" + "0" * 24 + "11" * 20,
                                         "0x" + "0" * 24 + "22" * 20],
            "data": "0x" + f"{amount:064x}", "removed": False,
            "blockHash": "0x" + "33" * 32, "blockNumber": "0xa",
            "transactionHash": "0x" + "44" * 32, "logIndex": hex(index)}


class CaptureTests(unittest.TestCase):
    def test_one_stream_avoids_mirrored_double_count_and_deduplicates_delivery(self):
        native = log()
        mirror = log(index=1, amount=100, emitter=ERC20)
        eligible, excluded, ignored = select_movements([native, copy.deepcopy(native), mirror])
        self.assertEqual((len(eligible), len(excluded), ignored), (1, 0, 1))
        self.assertEqual(eligible[0]["amount_microusd"], 100)

    def test_same_amount_at_distinct_log_indices_is_not_collapsed(self):
        eligible, _, _ = select_movements([log(index=0), log(index=2)])
        self.assertEqual(len(eligible), 2)

    def test_conflicting_duplicate_identity_rejected(self):
        with self.assertRaisesRegex(ValueError, "conflicting duplicate"):
            select_movements([log(), log(amount=101 * SCALE)])

    def test_sub_micro_precision_is_excluded_without_rounding(self):
        eligible, excluded, _ = select_movements([log(amount=100 * SCALE + 1)])
        self.assertEqual(eligible, [])
        self.assertEqual(excluded[0]["reason"], "sub-micro-precision-not-supported-by-reconciliation-v1")

    def test_removed_or_bad_padding_rejected(self):
        removed = log()
        removed["removed"] = True
        with self.assertRaises(ValueError):
            decode(removed)
        malformed = log()
        malformed["topics"][1] = "0x" + "ff" * 32
        with self.assertRaises(ValueError):
            decode(malformed)

    def test_mints_do_not_become_customer_receipts(self):
        minted = log()
        minted["topics"][1] = "0x" + "0" * 64
        eligible, excluded, _ = select_movements([minted])
        self.assertEqual(eligible, [])
        self.assertEqual(excluded[0]["reason"], "mint-or-burn-not-a-customer-receipt")

    def test_qualification_requires_success_and_consistent_finalized_block(self):
        raw = log()
        item = select_movements([raw])[0][0]
        receipt = {"status": "0x1", "transactionHash": raw["transactionHash"],
                   "blockHash": raw["blockHash"], "blockNumber": "0xa", "logs": [raw]}
        block = {"hash": raw["blockHash"], "number": "0xa"}
        qualify(item, receipt, block, {"number": "0xb"})
        with self.assertRaises(ValueError):
            qualify(item, receipt, block, {"number": "0x9"})
        receipt["status"] = "0x0"
        with self.assertRaises(ValueError):
            qualify(item, receipt, block, {"number": "0xb"})
        receipt["status"] = "0x1"
        block["hash"] = "0x" + "55" * 32
        with self.assertRaises(ValueError):
            qualify(item, receipt, block, {"number": "0xb"})


if __name__ == "__main__":
    unittest.main()
