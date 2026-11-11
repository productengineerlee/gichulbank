import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { Award, BarChart3, BookOpenCheck, ClipboardList, LayoutDashboard, ListChecks, LogOut, MessageSquareText, Users } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { requireAdmin } from "@/lib/admin-auth";
import { LoadingScreen } from "@/components/system/loading-screen";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireAdmin();
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/admin"><Image src="/mascot.png" alt="" width={32} height={32} className="brand-mark" />기출<b>뱅크</b></Link>
      <nav>
        <Link href="/admin"><LayoutDashboard />관리자 홈</Link>
        <Link href="/admin/exams"><BookOpenCheck />시험·문항 관리</Link>
        <Link href="/admin/attempts"><ListChecks />전체 응시 현황</Link>
        <Link href="/admin/members"><Users />회원가입 현황</Link>
        <Link href="/admin/reviews"><MessageSquareText />회차 후기 관리</Link>
        <Link href="/admin/diagnostics"><BarChart3 />진단 규칙 관리</Link>
        <Link href="/admin/license-schedules"><Award />자격증 일정 관리</Link>
        <Link href="/license"><ClipboardList />사용자 시험 화면</Link>
      </nav>
      <div className="admin-account"><span>ADMIN</span><strong>{profile.display_name || user.email?.split("@")[0]}</strong><small>{user.email}</small><form action={signOut}><button><LogOut />로그아웃</button></form></div>
    </aside>
    <div className="admin-main"><Suspense fallback={<LoadingScreen label="관리자 데이터를 불러오고 있습니다" />}>{children}</Suspense></div>
  </div>;
}
