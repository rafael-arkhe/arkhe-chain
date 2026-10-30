"""Offline verification against a root supplied by trusted application config."""
import json
from pathlib import Path
import wasmtime


class VerificationError(ValueError):
    pass


class MmrVerifier:
    def __init__(self, module_path: str | Path):
        config = wasmtime.Config()
        config.consume_fuel = True
        self.engine = wasmtime.Engine(config)
        self.module = wasmtime.Module.from_file(self.engine, str(module_path))
        if self.module.imports:
            raise VerificationError("expected the import-free arkhe-python-bridge module")

    def verify(self, leaf: bytes, leaf_count: int, proof: list[dict], trusted_root: bytes) -> bool:
        if type(leaf_count) is not int or not 0 < leaf_count <= 0xFFFFFFFF:
            raise VerificationError("leaf_count must be a positive u32")
        if len(trusted_root) != 32:
            raise VerificationError("trusted_root must contain 32 bytes")
        payload = json.dumps({"leaf": list(leaf), "leaf_count": leaf_count,
                              "proof": proof, "root": list(trusted_root)}, allow_nan=False).encode()
        if len(payload) > 65536:
            raise VerificationError("proof request exceeds 64 KiB")
        try:
            with wasmtime.Store(self.engine) as store:
                store.set_fuel(10_000_000)
                store.set_limits(memory_size=32 * 1024 * 1024, instances=1, memories=1)
                exports = wasmtime.Instance(store, self.module, []).exports(store)
                if exports["arkhe_abi_version"](store) != 1:
                    raise VerificationError("unsupported Arkhe ABI")
                if len(payload) > exports["arkhe_input_capacity"](store):
                    raise VerificationError("proof exceeds guest capacity")
                exports["memory"].write(store, payload, exports["arkhe_input_ptr"](store))
                result = exports["arkhe_verify_mmr"](store, len(payload))
        except (wasmtime.WasmtimeError, wasmtime.Trap, KeyError) as error:
            raise VerificationError("WASM verification failed") from error
        if result not in (0, 1):
            raise VerificationError("invalid MMR proof encoding")
        return result == 1
