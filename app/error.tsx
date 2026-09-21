"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-white p-6">
    <h1 className="text-lg font-semibold">Не удалось открыть страницу</h1>
    <p className="my-3 text-sm text-slate-600">Повторите загрузку. Если ошибка повторяется, обратитесь к организатору демонстрации.</p>
    <button onClick={reset} className="rounded bg-blue-600 px-4 py-2 text-white">Повторить</button>
  </div>;
}
