#!/usr/bin/env python3
"""
ACRCloud Python SDK Recognizer implementation.
Reference: https://github.com/acrcloud/acrcloud_sdk_python
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Union

try:
    import requests
except ImportError:
    requests = None

log = logging.getLogger("acrcloud")


class ACRCloudRecognizeType:
    ACR_OPT_REC_AUDIO = 0
    ACR_OPT_REC_HUMMING = 1
    ACR_OPT_REC_BOTH = 2


class ACRCloudRecognizer:
    """
    Official Python SDK client for ACRCloud audio recognition service.
    Supports classic HMAC signing and modern OpenAPI JWT Bearer tokens.
    Conforms to https://github.com/acrcloud/acrcloud_sdk_python API.
    """

    def __init__(self, config: dict):
        self.host = config.get("host", "api.acrcloud.com")
        self.access_key = config.get("access_key", "")
        self.access_secret = config.get("access_secret", "")
        self.token = config.get("token", "")
        self.timeout = config.get("timeout", 15)
        self.recognize_type = config.get("recognize_type", ACRCloudRecognizeType.ACR_OPT_REC_AUDIO)

    def _generate_hmac_signature(self, http_method: str, http_uri: str, data_type: str, timestamp: str) -> str:
        signature_version = "1"
        string_to_sign = (
            f"{http_method}\n"
            f"{http_uri}\n"
            f"{self.access_key}\n"
            f"{data_type}\n"
            f"{signature_version}\n"
            f"{timestamp}"
        )
        sign = base64.b64encode(
            hmac.new(
                self.access_secret.encode("ascii"),
                string_to_sign.encode("ascii"),
                digestmod=hashlib.sha1,
            ).digest()
        ).decode("ascii")
        return sign

    def recognize_by_file(
        self,
        file_path: Union[str, Path],
        start_seconds: int = 0,
        rec_length: int = 15,
    ) -> str:
        """
        Recognize audio by local file path.
        Returns a JSON-encoded string matching ACRCloud response format.
        """
        path = Path(file_path)
        if not path.exists():
            return json.dumps({
                "status": {"code": 2005, "msg": f"File does not exist: {file_path}", "version": "1.0"},
            })

        file_size = os.path.getsize(path)
        with open(path, "rb") as f:
            sample_bytes = min(1_000_000, file_size)
            sample = f.read(sample_bytes)

        return self.recognize_by_filebuffer(sample, start_seconds=start_seconds, rec_length=rec_length)

    def recognize_by_filebuffer(
        self,
        file_buffer: bytes,
        start_seconds: int = 0,
        rec_length: int = 15,
    ) -> str:
        """
        Recognize audio by raw bytes buffer.
        """
        http_method = "POST"
        http_uri = "/v1/identify"
        req_url = f"https://{self.host}{http_uri}" if not self.host.startswith("http") else f"{self.host}{http_uri}"

        # 1. OpenAPI JWT Bearer token authentication
        if self.token and not self.access_key:
            boundary = f"----ACRCloudBoundary{int(time.time())}"
            body = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="sample"; filename="sample.wav"\r\n'
                f"Content-Type: audio/wav\r\n\r\n"
            ).encode("utf-8") + file_buffer + f"\r\n--{boundary}--\r\n".encode("utf-8")

            req = urllib.request.Request(
                req_url,
                data=body,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                },
                method=http_method,
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return resp.read().decode("utf-8")
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                return err_body or json.dumps({"status": {"code": e.code, "msg": str(e), "version": "1.0"}})
            except Exception as e:
                return json.dumps({"status": {"code": 3000, "msg": f"Http Error: {e}", "version": "1.0"}})

        # 2. Classic HMAC-SHA1 identification
        if not self.access_key or not self.access_secret:
            return json.dumps({
                "status": {"code": 2004, "msg": "Missing access_key or access_secret or token", "version": "1.0"},
            })

        timestamp = str(int(time.time()))
        sign = self._generate_hmac_signature(http_method, http_uri, "audio", timestamp)

        boundary = f"----ACRCloudBoundary{int(time.time())}"
        fields = {
            "access_key": self.access_key,
            "sample_bytes": str(len(file_buffer)),
            "timestamp": timestamp,
            "signature": sign,
            "data_type": "audio",
            "signature_version": "1",
        }

        body_parts = []
        for k, v in fields.items():
            body_parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode("utf-8")
            )
        body_parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"sample\"; filename=\"sample.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode("utf-8")
            + file_buffer
            + f"\r\n--{boundary}--\r\n".encode("utf-8")
        )
        full_body = b"".join(body_parts)

        req = urllib.request.Request(
            req_url,
            data=full_body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method=http_method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            return err_body or json.dumps({"status": {"code": e.code, "msg": str(e), "version": "1.0"}})
        except Exception as e:
            return json.dumps({"status": {"code": 3000, "msg": f"Http Error: {e}", "version": "1.0"}})
