import Link from 'next/link'

export default function Nav() {
  return (
    <nav className="border-b border-gray-800 px-6 py-4 flex gap-8 text-sm">
      <span className="font-bold text-white">Diablo</span>
      <Link href="/dashboard" className="text-gray-400 hover:text-white">Usage</Link>
      <Link href="/models" className="text-gray-400 hover:text-white">Models</Link>
      <Link href="/keys" className="text-gray-400 hover:text-white">API Keys</Link>
    </nav>
  )
}