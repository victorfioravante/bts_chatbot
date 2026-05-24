// Full static class strings so Tailwind's scanner detects every class at build time.
export const CHANNEL_STYLES = {
  en:     { text: "text-blue-400",     tag: "bg-blue-500/15 text-blue-300",      tab: "bg-blue-600/80 text-white",      dot: "bg-blue-400" },
  br:     { text: "text-emerald-400",  tag: "bg-emerald-500/15 text-emerald-300", tab: "bg-emerald-600/80 text-white",   dot: "bg-emerald-400" },
  fr:     { text: "text-purple-400",   tag: "bg-purple-500/15 text-purple-300",   tab: "bg-purple-600/80 text-white",    dot: "bg-purple-400" },
  in:     { text: "text-orange-400",   tag: "bg-orange-500/15 text-orange-300",   tab: "bg-orange-600/80 text-white",    dot: "bg-orange-400" },
  id:     { text: "text-pink-400",     tag: "bg-pink-500/15 text-pink-300",       tab: "bg-pink-600/80 text-white",      dot: "bg-pink-400" },
  ph:     { text: "text-cyan-400",     tag: "bg-cyan-500/15 text-cyan-300",       tab: "bg-cyan-600/80 text-white",      dot: "bg-cyan-400" },
  ru:     { text: "text-red-400",      tag: "bg-red-500/15 text-red-300",         tab: "bg-red-600/80 text-white",       dot: "bg-red-400" },
  es:     { text: "text-lime-400",     tag: "bg-lime-500/15 text-lime-300",       tab: "bg-lime-600/80 text-white",      dot: "bg-lime-400" },
  pk:     { text: "text-teal-400",     tag: "bg-teal-500/15 text-teal-300",       tab: "bg-teal-600/80 text-white",      dot: "bg-teal-400" },
  rs:     { text: "text-violet-400",   tag: "bg-violet-500/15 text-violet-300",   tab: "bg-violet-600/80 text-white",    dot: "bg-violet-400" },
  system: { text: "text-yellow-400",   tag: "bg-yellow-500/15 text-yellow-300",   tab: "bg-yellow-600/80 text-white",    dot: "bg-yellow-400" },
};

export const fallbackChannel = {
  text: "text-muted-foreground",
  tag:  "bg-muted text-muted-foreground",
  tab:  "bg-accent text-foreground",
  dot:  "bg-muted-foreground",
};

export function ch(channel) {
  return CHANNEL_STYLES[channel] || fallbackChannel;
}
