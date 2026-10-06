# Dormant legacy-session adapter

The application entry point retains the memory default. Its source gate rejects durable selection, including environment-only attempts. Its protocol probe
requires runtime version 2 with activationReady=false. This change applies no schema
and provides no environment flag that can activate durable authentication. See [runtime evidence and unresolved release decision](durable-session-runtime-20261006.md).

The server generates a 32-byte random bearer and sends only its SHA-256 digest
to session RPCs. Passwords go only to transactional issuance, not adapter
storage. Every identity and revocation call is awaited, without a positive
cache or process-local fallback. Other authentication protocols and malformed
tokens do not cause legacy-database requests.

Responses are checked for shape, identity, incarnation UUID, bounded decimal
generation, calendar timestamps and the exact one-hour or 720-hour duration.
Duration checks preserve PostgreSQL microseconds before converting expiry to
milliseconds. Database status determines validity, not the server host clock.
Provider errors and timeouts are sanitized without retaining their cause or
logging credentials.

Issuance is never retried automatically. Documented rejections cannot insert
a session and cause no revocation, including on token collision. Unknown
outcomes cause best-effort cleanup of only the unreturned attempt's random
token digest. That is not proof of rollback: an ambiguous late commit can leave
a row until expiration/cleanup. Unrelated devices are never revoked to hide it.

Synthetic RPC unit tests verify this parser/transport boundary. They do not
prove database cryptography, concurrency, PostgREST, hosted permissions,
deployment or restart survival. Those require the separate native SQL harness
and complete rollout review. Verified restoration, live-socket revocation,
operational cleanup and coordinated authority selection remain activation
requirements. Existing in-memory tokens require a disclosed reauthentication
cutover; this adapter does not import arbitrary client tokens.
