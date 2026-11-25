#!/bin/sh
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-klox/databases/(default)/documents" >/dev/null
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-klox/accounts" >/dev/null
curl -s -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" "http://127.0.0.1:8080/v1/projects/demo-klox/databases/(default)/documents/members/carlos@test.com" -d '{"fields":{"id":{"stringValue":"'"${KLOX_OWNER:-u_TESTOWNER0000000000000}"'"},"owner":{"booleanValue":true}}}' >/dev/null
echo seeded
