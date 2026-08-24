import { useToastStore } from './toast';

const STYLES = {
  error: 'bg-red-600/90 border-red-500',
  success: 'bg-green-600/90 border-green-500',
  info: 'bg-blue-600/90 border-blue-500',
};

export default function Toasts() {
  const { toasts, remove } = useToastStore();
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => remove(t.id)}
          className={`px-4 py-3 rounded-lg border text-white text-sm shadow-lg cursor-pointer animate-[slideIn_0.2s] ${STYLES[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
