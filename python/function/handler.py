import base64
from typing import Dict, Any


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    request = event["Records"][0]["cf"]["request"]
    headers = request.get("headers", {})

    custom_headers = request.get("origin")["s3"]["customHeaders"]
    configured_username = custom_headers["x-basic-auth-username"][0]["value"]
    configured_password = custom_headers["x-basic-auth-password"][0]["value"]

    expected_auth = f"Basic {base64.b64encode(f'{configured_username}:{configured_password}'.encode()).decode()}"
    if (
        headers.get("authorization")
        and headers["authorization"][0]["value"] == expected_auth
    ):
        return request

    return {
        "status": "401",
        "statusDescription": "Unauthorized",
        "headers": {
            "www-authenticate": [{"key": "WWW-Authenticate", "value": "Basic"}]
        },
    }
