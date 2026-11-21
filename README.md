# Toán Du Ký — Hệ thức lượng trong tam giác (Toán 10)

Ứng dụng web game phiêu lưu học Toán lớp 10 **Chương III "Hệ thức lượng trong tam giác"** (bộ *Kết nối tri thức với cuộc sống*), sử dụng **Supabase (PostgreSQL + Auth + RLS)** và triển khai trên **Vercel**.

## 1. Cấu trúc thư mục

- `supabase/migrations/001_initial_schema.sql` — Lược đồ PostgreSQL, phân quyền RBAC (`admin`, `teacher`, `student`), Row-Level Security (RLS) trên toàn bộ bảng và các RPC khởi tạo an toàn (`bootstrap_first_admin`, `validate_class_code`, `register_student_profile`).
- `api/ai/` — Vercel Serverless Functions (`/api/ai/status`, `/api/ai/extract`, `/api/ai/review-open`) cho trợ lý AI Gemini ở phía máy chủ.
- `vercel.json` — Cấu hình triển khai Vite SPA + Vercel Functions.
- `server.ts` — Máy chủ Express + Vite middleware cho môi trường phát triển cục bộ.
- `src/supabase.ts` — Khởi tạo client `@supabase/supabase-js` (đọc `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`).
- `src/services/dataService.ts` — Lớp `DataService` kép: `SupabaseAdapter` (PostgreSQL + đồng bộ không trùng) và `LocalAdapter` (dự phòng ngoại tuyến tự động).
- `src/config.ts`, `src/journey.ts`, `src/math/`, `src/components/`, `src/screens/` — Toàn bộ logic Toán học, hành trình 10 mốc, 5 BOSS và giao diện M0–M11, `#/selftest`.

## 2. Biến môi trường (`.env` / Vercel Environment Variables)

Sao chép `.env.example` sang `.env` (hoặc cấu hình trong **Vercel Project → Settings → Environment Variables**):

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `VITE_SUPABASE_URL` | Có (để đồng bộ CSDL) | Project URL từ Supabase (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Có (để đồng bộ CSDL) | Publishable key (`sb_publishable_...`) từ Supabase |
| `GEMINI_API_KEY` | Tùy chọn | Khóa Gemini AI phía máy chủ cho tính năng trích xuất học liệu & nhận xét lập luận mở |

> **Lưu ý Supabase Auth:** Vì học viên đăng ký bằng tên đăng nhập lớp học (dạng `hocvien01`), hãy tắt **Confirm email** trong **Supabase Dashboard → Authentication → Providers → Email** để học viên có thể đăng nhập ngay lập tức.

## 3. Khởi chạy cục bộ & Kiểm thử

```bash
npm install
npm run dev      # Chạy Express + Vite trên cổng 3000
npm run build    # Biên dịch bản production (dist/)
npm run lint     # Kiểm tra kiểu TypeScript
npx --yes tsx --test src/math/core.test.ts
```

- **Tự kiểm tra trên trình duyệt:** Mở `/#/selftest` hoặc vào **M11 Quản trị → Tab 9. Tự kiểm tra**.
