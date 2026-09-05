import os
import time

import jwt
import requests

APP_ID = os.environ["GITHUB_APP_ID"]
INSTALLATION_ID = os.environ["GITHUB_INSTALLATION_ID"]
PRIVATE_KEY_PATH = os.path.expanduser(os.environ["GITHUB_PRIVATE_KEY_PATH"])


with open(PRIVATE_KEY_PATH, "r") as f:
    private_key = f.read()


now = int(time.time())

payload = {
    "iat": now - 60,
    "exp": now + 540,
    "iss": APP_ID,
}

jwt_token = jwt.encode(
    payload,
    private_key,
    algorithm="RS256",
)


response = requests.post(
    f"https://api.github.com/app/installations/{INSTALLATION_ID}/access_tokens",
    headers={
        "Authorization": f"Bearer {jwt_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    },
)

response.raise_for_status()

print(response.json()["token"])
