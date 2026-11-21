# Security Specification — Toán Du Ký (Firestore & Auth)

## 1. Roles & Identity
- **Admin (`role == 'admin'`, `status == 'active'`)**: Full read/write/delete permissions across all collections. Identified via `/admins/{uid}`, active admin profile at `/users/{uid}`, or verified bootstrap owner email.
- **Teacher (`role == 'teacher'`, `status == 'active'`)**:
  - Can read ONLY student profiles, attempts, events, rebuttals, and survey reports belonging to classes assigned to them (`teacherUid == request.auth.uid` or `classId in teacher.assignedClassIds`).
  - Can create/update questions and review/reply to rebuttals belonging to their assigned classes.
  - Can create/manage their own classes and classCodes (`teacherUid == request.auth.uid`).
  - Cannot modify global settings or elevate roles.
- **Student (`role == 'student'`, `status == 'active'`)**:
  - Can read and update ONLY their own `/users/{uid}` document.
  - Strictly prohibited from modifying `uid`, `role`, `classId`, `classCode`, `status`, `locked`, `studentCode`, `isTestAccount`, `teacherUid`, `assignedClassIds`, or `createdAt`.
  - Can read ONLY their own `/attempts`, `/events`, `/rebuttals`, and `/reports`.
  - Can create `/attempts`, `/events` (append-only, doc ID == `eventId`), `/rebuttals` (`status == 'pending'`), and `/reports` ONLY for themselves with matching `classId`, `teacherUid`, and `studentCode`.
  - Can read `/questions` ONLY when `review_status == 'approved'`, OR when `review_status == 'pending_teacher_review'` AND `/config/settings.allowPendingInTestMode == true`. Never reads `rejected` questions.

## 2. First-Time Admin Bootstrap (`/config/setup`)
- `/config/setup` contains ONLY `{ initialized: true, createdAt }` (no PII).
- `get` is permitted to check whether initial setup is needed on M1b; `list`, `update`, and `delete` are denied.
- First admin creation is permitted ONLY in an atomic batch when `!exists(/config/setup)` and `existsAfter(/config/setup)` and `getAfter(/users/$(uid)).data.role == 'admin'`. Once created, no second user can bootstrap as admin.

## 3. Class-Code Registration & Rollback
- `/classCodes/{code}` allows single-doc `get` for signed-in users (no `list` for students).
- Creating `/users/{uid}` as a student requires `classCodes/{classCode}` to exist, be `active == true`, and match `classId` and `teacherUid`.
- Client-side `registerStudent` validates `classCodes/{code}` after Auth creation; if invalid or expired, it immediately deletes the newly created Auth user (`deleteUser`) so no orphan account remains.
