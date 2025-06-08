import './globals.css'
import { Inter } from 'next/font/google'
import React from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'kSync Multiplayer Game',
  description: 'Real-time multiplayer game built with kSync',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100">
          {children}
        </div>
      </body>
    </html>
  )
} 