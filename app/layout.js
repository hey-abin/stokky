import "./globals.css";

export const metadata = {
  title: "stokky",
  description: "Keyword matched random video and text chat built with Next.js, Socket.IO, WebRTC, Tailwind, and MongoDB."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
