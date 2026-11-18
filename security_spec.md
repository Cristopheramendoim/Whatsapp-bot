# ZapAssist Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
- Every document under `/users/{userId}` (profile, threads, messages, tasks) belongs exclusively to `userId == request.auth.uid` with `request.auth.token.email_verified == true`.
- User PII (`email`, `displayName`, `photoURL`) is readable and writable only by the owning user.
- A `ChatThread` or `TaskItem` cannot be created unless the parent `/users/{userId}` document exists.
- A `ChatMessage` cannot be created unless its parent `/users/{userId}/threads/{threadId}` exists and `incoming().threadId == threadId`.
- All timestamps (`createdAt`, `updatedAt`) must equal `request.time`; `createdAt` and `ownerId`/`uid` are immutable after creation.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/uid1/tasks/t1`.
2. Authenticated user `uid2` reading `/users/uid1` (PII leak test).
3. Authenticated user `uid1` with `email_verified: false` writing a task (Email spoofing test).
4. Authenticated user `uid1` creating `/users/uid1/tasks/t1` with `ownerId: "uid2"` (Identity spoofing).
5. Creating a task with an invalid 200-char ID or special chars `/users/uid1/tasks/bad$id` (Path poisoning).
6. Creating a task with extra ghost field `{ ..., isAdmin: true }` (Shadow field injection).
7. Creating a task with `priority: "urgente"` outside `['alta', 'media', 'baixa']`.
8. Updating a task while mutating `ownerId` or `createdAt` (Immortal field mutation).
9. Updating a task with client-forged `updatedAt` instead of `request.time` (Temporal integrity).
10. Creating a `ChatMessage` under a non-existent `threadId` (Master gate / orphan write).
11. Creating a `ChatMessage` with `suggestedTasks` array > 8 items (Array size exhaustion).
12. `list` query on `/users/uid1/tasks` executed by `uid2` (Query scraping).
