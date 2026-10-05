export const metadata = {
  title: 'Trulo Developer Portal',
  description: 'Build and manage apps for the Trulo platform',
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, sans-serif", background: '#0a0a0a' }}>
        {children}
      </body>
    </html>
  )
}
