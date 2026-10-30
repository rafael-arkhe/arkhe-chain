import copy
import unittest
from Crypto.Hash import keccak
from arc_capture import ERC20
from arc_memos import BEFORE_TOPIC, MEMO, MEMO_TOPIC, decode_memo, inspect_receipt
from test_arc_capture import log


def word(value):
    return value.to_bytes(32, "big")


def receipt_fixture():
    movement = log(index=1)
    before = copy.deepcopy(movement)
    before.update(address=MEMO, topics=[BEFORE_TOPIC, "0x" + word(7).hex()], data="0x", logIndex="0x0")
    calldata = bytes.fromhex("a9059cbb" + "0" * 24 + "22" * 20 + f"{100:064x}")
    call_hash = keccak.new(digest_bits=256, data=calldata).digest()
    memo = copy.deepcopy(movement)
    data = call_hash + word(96) + word(7) + word(3) + b"INV" + bytes(29)
    memo.update(address=MEMO, topics=[MEMO_TOPIC, movement["topics"][1], "0x" + "0" * 24 + ERC20[2:], "0x" + "77" * 32],
                data="0x" + data.hex(), logIndex="0x2")
    return {"status": "0x1", "transactionHash": movement["transactionHash"],
            "blockHash": movement["blockHash"], "blockNumber": movement["blockNumber"],
            "from": "0x" + "11" * 20, "to": MEMO, "logs": [before, movement, memo]}


class MemoTests(unittest.TestCase):
    def test_direct_transfer_frame_and_calldata_hash_bind(self):
        result = inspect_receipt(receipt_fixture())
        self.assertEqual(result["associations"][0]["status"], "bound-direct-transfer")
        self.assertEqual(result["associations"][0]["candidate_movement_log_indices"], [1])
        self.assertEqual(result["memos"][0]["memo_hex"], "0x494e56")
        self.assertEqual(result["reference_assignment"], "none; application-specific memoId/invoice mapping required")

    def test_wrong_calldata_hash_retained_but_not_associated(self):
        receipt = receipt_fixture()
        data = receipt["logs"][2]["data"]
        receipt["logs"][2]["data"] = "0x" + "00" * 32 + data[66:]
        self.assertEqual(inspect_receipt(receipt)["associations"][0]["status"], "unassociated-unsupported-or-ambiguous")

    def test_multiple_movements_not_implicitly_associated(self):
        receipt = receipt_fixture()
        extra = copy.deepcopy(receipt["logs"][1])
        extra["logIndex"] = "0x2"
        receipt["logs"][2]["logIndex"] = "0x3"
        receipt["logs"].insert(2, extra)
        self.assertEqual(inspect_receipt(receipt)["associations"][0]["candidate_movement_log_indices"], [])

    def test_missing_or_unordered_frame_rejected(self):
        receipt = receipt_fixture()
        receipt["logs"][0]["logIndex"] = "0x3"
        with self.assertRaisesRegex(ValueError, "unordered"):
            inspect_receipt(receipt)
        receipt["logs"].pop(0)
        with self.assertRaisesRegex(ValueError, "missing"):
            inspect_receipt(receipt)

    def test_bad_offset_padding_and_emitter_rejected(self):
        memo = receipt_fixture()["logs"][2]
        original = memo["data"]
        memo["data"] = original[:66] + word(64).hex() + original[130:]
        with self.assertRaises(ValueError):
            decode_memo(memo)
        memo["data"] = original[:-2] + "01"
        with self.assertRaises(ValueError):
            decode_memo(memo)
        memo["data"] = original
        memo["address"] = ERC20
        with self.assertRaises(ValueError):
            decode_memo(memo)

    def test_sender_and_target_must_agree(self):
        receipt = receipt_fixture()
        receipt["from"] = "0x" + "55" * 20
        self.assertEqual(inspect_receipt(receipt)["associations"][0]["candidate_movement_log_indices"], [])
        receipt = receipt_fixture()
        receipt["logs"][2]["topics"][2] = "0x" + "0" * 24 + "55" * 20
        self.assertEqual(inspect_receipt(receipt)["associations"][0]["candidate_movement_log_indices"], [])

    def test_memo_from_other_transaction_rejected(self):
        receipt = receipt_fixture()
        receipt["logs"][2]["transactionHash"] = "0x" + "88" * 32
        with self.assertRaisesRegex(ValueError, "provenance"):
            inspect_receipt(receipt)

    def test_no_memo_is_absence_not_fabricated_reference(self):
        receipt = receipt_fixture()
        receipt["logs"] = [receipt["logs"][1]]
        result = inspect_receipt(receipt)
        self.assertEqual(result["memos"], [])
        self.assertEqual(result["associations"], [])


if __name__ == "__main__":
    unittest.main()
