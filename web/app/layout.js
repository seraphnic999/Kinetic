import './globals.css';

export const metadata = {
  title: 'Kinetic',
  description: 'Training, measured.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* The same two faces as the phone (§3.1): Barlow Semi Condensed for
            display, Inter for language. DSEG7 is deliberately absent — it is
            for LIVE countdowns, and nothing on a dashboard is counting down. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body className="bg-bg text-ink min-h-screen antialiased font-sans">{children}</body>
    </html>
  );
}
