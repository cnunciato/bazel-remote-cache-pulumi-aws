import base64
from typing import Dict, Any


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    request = event["Records"][0]["cf"]["request"]

    custom_headers = request.get("origin")["s3"]["customHeaders"]
    configured_username = custom_headers["x-basic-auth-username"][0]["value"]
    configured_password = custom_headers["x-basic-auth-password"][0]["value"]

    headers = request.get("headers")
    auth = headers.get("authorization")

    if auth:
        decoded = (
            base64.b64decode(auth[0]["value"].split("Basic ")[1])
            .decode("utf-8")
            .split(":")
        )
        username = decoded[0]
        password = decoded[1]

        if username == configured_username and password == configured_password:
            return request

    return {
        "status": "401",
        "statusDescription": "Unauthorized",
        "headers": {
            "www-authenticate": [{"key": "WWW-Authenticate", "value": "Basic"}]
        },
    }
