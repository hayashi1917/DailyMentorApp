export const metadata = {
  title: "オフライン | Daily Mentor Agent",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <p className="text-4xl">🍃</p>
      <h1 className="mt-4 text-xl font-bold">オフラインです</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-500">
        インターネットに接続できません。
        <br />
        つながったら、また続きから始めましょう。
        <br />
        焦らなくて大丈夫です。
      </p>
    </div>
  );
}
