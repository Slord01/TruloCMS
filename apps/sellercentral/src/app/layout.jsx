import "./globals.css";


export const metadata = {
  title: "Seller Central - Trulo",
  description: "Manage your store on Trulo",
  icons: { icon: "/trulo-icon.svg", shortcut: "/trulo-icon.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: 'Inter, Arial, sans-serif' }}>{children}</body>
    </html>
  );
}
