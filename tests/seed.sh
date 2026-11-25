#!/bin/sh
# reset emulators, then add team members (rules bypassed with "Bearer owner")
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-klox/databases/(default)/documents" >/dev/null
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-klox/accounts" >/dev/null
put(){ curl -s -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" "http://127.0.0.1:8080/v1/projects/demo-klox/databases/(default)/documents/$1" -d "$2" >/dev/null; }
put "members/carlos@test.com" '{"fields":{"id":{"stringValue":"uCARLOS"},"owner":{"booleanValue":true}}}'
put "members/ana@test.com" '{"fields":{"id":{"stringValue":"uANA"},"owner":{"booleanValue":false}}}'
echo seeded
