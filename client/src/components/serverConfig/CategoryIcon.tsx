import {
  Settings,
  Globe,
  Swords,
  MessageSquare,
  Users,
  Home,
  Package,
  Puzzle,
  Cloud,
  Mic,
  MessageCircle,
  Terminal,
  Archive,
  Car,
  Shield,
  Filter,
  Radio,
  FileText,
  Wrench,
  Clock,
  Gem,
  Heart,
  Crosshair,
  Leaf,
  Map,
  Compass,
  Skull,
  TrendingUp,
  BarChart,
  Layers,
  type LucideIcon
} from 'lucide-react'

// Map of icon names used by INI/Sandbox category schemas to lucide components.
// Each entry also has a hue token used to subtly tint the sidebar icon so categories
// are scannable by shape+color without going neon.
const CATEGORY_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  // INI categories
  Settings: { icon: Settings, tone: 'text-primary/80' },
  Globe: { icon: Globe, tone: 'text-sky-400/80' },
  Swords: { icon: Swords, tone: 'text-rose-400/80' },
  MessageSquare: { icon: MessageSquare, tone: 'text-cyan-400/80' },
  Users: { icon: Users, tone: 'text-amber-300/80' },
  Home: { icon: Home, tone: 'text-emerald-300/80' },
  Package: { icon: Package, tone: 'text-orange-300/80' },
  Puzzle: { icon: Puzzle, tone: 'text-violet-400/80' },
  Cloud: { icon: Cloud, tone: 'text-sky-300/80' },
  Mic: { icon: Mic, tone: 'text-pink-300/80' },
  MessageCircle: { icon: MessageCircle, tone: 'text-indigo-300/80' },
  Terminal: { icon: Terminal, tone: 'text-emerald-400/80' },
  Archive: { icon: Archive, tone: 'text-amber-400/80' },
  Car: { icon: Car, tone: 'text-yellow-300/80' },
  Shield: { icon: Shield, tone: 'text-blue-300/80' },
  Filter: { icon: Filter, tone: 'text-slate-300/80' },
  Radio: { icon: Radio, tone: 'text-fuchsia-300/80' },
  FileText: { icon: FileText, tone: 'text-zinc-300/80' },
  Wrench: { icon: Wrench, tone: 'text-stone-300/80' },
  // Sandbox categories
  Clock: { icon: Clock, tone: 'text-amber-300/80' },
  Gem: { icon: Gem, tone: 'text-fuchsia-300/80' },
  Heart: { icon: Heart, tone: 'text-rose-300/80' },
  Crosshair: { icon: Crosshair, tone: 'text-rose-400/80' },
  Leaf: { icon: Leaf, tone: 'text-emerald-300/80' },
  Map: { icon: Map, tone: 'text-emerald-400/80' },
  Compass: { icon: Compass, tone: 'text-cyan-300/80' },
  Skull: { icon: Skull, tone: 'text-rose-300/80' },
  TrendingUp: { icon: TrendingUp, tone: 'text-orange-300/80' },
  BarChart: { icon: BarChart, tone: 'text-amber-300/80' },
  Layers: { icon: Layers, tone: 'text-stone-300/80' },
}

export function CategoryIcon({ name, isActive, className }: { name?: string; isActive?: boolean; className?: string }) {
  const entry = name ? CATEGORY_ICONS[name] : undefined
  const Icon = entry?.icon ?? Settings
  return <Icon className={`${className ?? 'h-4 w-4'} ${isActive ? 'text-primary' : entry?.tone ?? 'text-muted-foreground/70'}`} />
}
