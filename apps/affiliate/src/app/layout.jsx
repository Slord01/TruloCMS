export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Trulo Affiliate Portal',
  description: 'Generate affiliate links, track clicks, and manage payouts for the Trulo marketplace',
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
