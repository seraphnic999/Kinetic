import './globals.css';

export const metadata = {
  title: 'Kinetic Dashboard',
  description: 'Your training companion — web dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-bg text-white min-h-screen antialiased">{children}</body>
    </html>
  );
}
