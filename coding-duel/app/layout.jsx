import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import Navbar from "@/components/Navbar";

export const metadata = {
  title: "CodeDuel",
  description: "Real-time competitive coding logic duels",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen">
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}