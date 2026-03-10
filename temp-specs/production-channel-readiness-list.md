# PowerLobster Channel Production Readiness Plan 🦞

Based on the [post-mortem analysis](/temp-specs/production-readiness-list.txt) and recent testing, we have divided the remaining tasks into **Plugin Tasks** (our responsibility) and **External Tasks** (Server/Relay team).

## 🛠️ Plugin Tasks (Our Responsibility)

These tasks require updates to the `openclaw-powerlobster-channel` repository.

### 1. Fix Routing Resolution Warning 🟡
**Issue:** Logs show `[PowerLobster] Routing resolution failed... TypeError: Cannot read properties of undefined (reading 'session')`.
**Impact:** Messages still work via fallback, but it clutters logs and indicates incorrect OpenClaw integration.
**Fix:**
- Investigate `channelRuntime.routing.resolveAgentRoute` parameters.
- Ensure `session` or other required context is properly mocked or passed.
- If OpenClaw's routing logic is fundamentally incompatible with our polling model, consider suppressing the warning or using a direct dispatch method permanently.

### 2. Implement Health Reporting 🟢
**Issue:** OpenClaw relies on "stale-socket" detection which is blunt.
**Fix:**
- Implement a health check callback if supported by the Channel API.
- Expose internal metrics (last poll time, error count) via a debug method.

### 3. Improve Error Handling / Recovery 🟢
**Issue:** WebSocket/Poller disconnects every ~2 minutes (could be normal server behavior, but client should handle it gracefully).
**Fix:**
- Verify that `poller.ts` handles connection resets without crashing.
- Add "jitter" to reconnection logic to prevent thundering herd if multiple agents restart.

### 4. Load Testing & Multi-Agent Verification 🟢
**Task:**
- Verify behavior when 10+ messages arrive in one poll cycle.
- Confirm that configuring *two* agents in `openclaw.json` correctly routes messages to the right agent ID.

### 5. Deployment Safety (Added based on feedback) 🟢
**Tasks:**
- **Version Tagging:** Tag a stable release (e.g., `v1.1.0-stable`) before fleet deployment.
- **Log Levels:** Implement `logLevel` configuration to suppress noise in production.
- **Rollback Plan:** Document revert steps in README.
- **Documentation:** Update README with deployment instructions and known issues.

---

## 🔗 External Tasks (Server / Relay Team)

These tasks must be handled by the PowerLobster backend team (Christian/Devs).

### 1. Fix ACK 500 Errors 🔴
**Issue:** `POST /api/relay/{relayId}/ack` returns `500 Internal Server Error`.
**Impact:** Events stay in "Queued" state and may be re-delivered, causing duplicate replies.
**Request:**
> "Please investigate why the Relay ACK endpoint is throwing 500 errors. Payload sent: `{ event_id: "..." }`. Headers: `Authorization: Bearer ...`."

### 2. Clarify WebSocket/Relay Behavior 🟡
**Issue:** Relay connection drops every ~2 minutes.
**Request:**
> "Is the 2-minute disconnection cycle on the Relay server expected behavior (e.g., load balancer timeout)? If so, we will suppress the 'reconnecting' logs to reduce noise."

### 3. Verify Rate Limits 🟢
**Request:**
> "We are polling every 30s. Is this acceptable for your infrastructure, or should we switch to a long-polling or WebSocket push model if available?"

---

## 📋 Immediate Next Steps for Us

1.  **Code Review:** Check `src/channel.ts` for the routing logic causing the `undefined session` error.
2.  **Refactor:** Clean up the "Routing Resolution" block to be more robust.
3.  **Test:** Simulate a 500 error on ACK to ensure it doesn't crash the plugin loop.
