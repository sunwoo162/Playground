import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "증빙함",
    template: "%s | 증빙함",
  },
  description: "구매·계약·환불 과정의 사실과 증빙을 놓치지 않게 정리하는 개인 증빙 보관함",
};

export const viewport: Viewport = {
  themeColor: "#f7f4ea",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
