import { useEffect } from 'react';

export default function NotFound() {
  useEffect(() => {
    // 🔥 SEO MASTERSTROKE: Google Bot ko strictly index karne se rokna
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");
    document.title = "404 - Page Not Found";
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-center">
      <div>
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-4 text-gray-600">Page Not Found</p>
      </div>
    </div>
  );
}
