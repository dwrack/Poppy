export function Soon({ title, emoji, blurb }: { title: string; emoji: string; blurb: string }) {
  return (
    <div className="safe-top flex min-h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="text-6xl">{emoji}</div>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <p className="text-mute">{blurb}</p>
    </div>
  )
}
