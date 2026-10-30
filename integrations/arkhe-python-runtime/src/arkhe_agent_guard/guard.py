"""Apply before LangChain's @tool; guards keyword-only JSON tool inputs."""
import asyncio
import functools
import inspect
import json
import logging
import uuid
from arkhe_verify.gate import AuthorizationRejected

logger = logging.getLogger(__name__)


def guarded_tool(gate, *, intent_type: str):
    def decorate(function):
        signature = inspect.signature(function)

        @functools.wraps(function)
        async def guarded(**kwargs):
            bound = signature.bind(**kwargs)
            bound.apply_defaults()
            # Snapshot once: the authorized data is the exact data executed, even
            # when the caller mutates its original objects during authorization.
            arguments_json = json.dumps(bound.arguments, sort_keys=True, separators=(",", ":"), allow_nan=False)
            arguments = json.loads(arguments_json)
            authorization = await gate.authorize(
                tool=f"{function.__module__}.{function.__qualname__}",
                intent_type=intent_type, arguments_json=arguments_json,
                request_id=str(uuid.uuid4()))
            if not isinstance(authorization, dict) or authorization.get("decision") != "Allow":
                raise AuthorizationRejected("gate did not explicitly allow the action")
            logger.info("Arkhe tool authorized", extra=authorization)
            if inspect.iscoroutinefunction(function):
                return await function(**arguments)
            return await asyncio.to_thread(function, **arguments)
        return guarded
    return decorate
